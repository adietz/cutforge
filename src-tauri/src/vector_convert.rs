//! Convert proprietary / binary vector formats to SVG via system helpers.
//! Prefers: Inkscape (if installed) → pdftocairo / Ghostscript → LibreOffice Draw.

use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ConvertResult {
    pub svg: String,
    pub tool: String,
    pub message: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct HelperStatus {
    pub inkscape: bool,
    pub pdftocairo: bool,
    pub ghostscript: bool,
    pub libreoffice: bool,
    pub notes: Vec<String>,
}

#[tauri::command]
pub fn vector_helper_status() -> HelperStatus {
    let inkscape = which("inkscape");
    let pdftocairo = which("pdftocairo");
    let ghostscript = which("gs");
    let libreoffice = which("soffice") || which("libreoffice");
    let mut notes = Vec::new();
    if !inkscape {
        notes.push(
            "Inkscape not found — optional; improves CDR/EMF/AI. Install for best conversion."
                .into(),
        );
    }
    if !pdftocairo && !libreoffice {
        notes.push(
            "Install poppler-utils (pdftocairo) or LibreOffice for PDF/AI import.".into(),
        );
    }
    if !ghostscript {
        notes.push("Ghostscript (gs) recommended for EPS / legacy AI.".into());
    }
    if libreoffice {
        notes.push(
            "LibreOffice Draw available (libcdr) — CorelDRAW .cdr / EMF / WMF / PDF.".into(),
        );
    }
    HelperStatus {
        inkscape,
        pdftocairo,
        ghostscript,
        libreoffice,
        notes,
    }
}

#[tauri::command]
pub fn convert_vector_to_svg(
    filename: String,
    data: Vec<u8>,
) -> Result<ConvertResult, String> {
    if data.is_empty() {
        return Err("Empty file".into());
    }
    let ext = extension_of(&filename);
    let work = temp_dir()?;
    let input = work.join(format!("in.{}", if ext.is_empty() { "bin" } else { &ext }));
    fs::write(&input, &data).map_err(|e| format!("Write temp: {e}"))?;

    // SVG / SVGZ passthrough (gzip not handled — frontend should decompress svgz)
    if ext == "svg" {
        let svg = String::from_utf8(data).map_err(|e| format!("SVG utf8: {e}"))?;
        let _ = fs::remove_dir_all(&work);
        return Ok(ConvertResult {
            svg,
            tool: "passthrough".into(),
            message: "SVG read directly".into(),
        });
    }

    let magic_pdf = data.starts_with(b"%PDF");

    let result = match ext.as_str() {
        "pdf" | "ai" if magic_pdf || ext == "pdf" => pdf_to_svg(&input, &work),
        "ai" => {
            // Legacy AI often PostScript-based
            eps_to_svg(&input, &work).or_else(|_| {
                // Try as PDF anyway
                pdf_to_svg(&input, &work)
            })
        }
        "eps" | "ps" => eps_to_svg(&input, &work),
        "cdr" | "cmx" => {
            inkscape_to_svg(&input, &work).or_else(|_| libreoffice_to_svg(&input, &work))
        }
        "emf" | "wmf" | "emz" | "wmz" => {
            inkscape_to_svg(&input, &work).or_else(|_| libreoffice_to_svg(&input, &work))
        }
        "dxf" => {
            // Prefer JS; LO as fallback
            libreoffice_to_svg(&input, &work)
                .or_else(|_| inkscape_to_svg(&input, &work))
        }
        _ => {
            // Generic: try inkscape → LO → pdf pipeline if magic
            if magic_pdf {
                pdf_to_svg(&input, &work)
            } else {
                inkscape_to_svg(&input, &work)
                    .or_else(|_| libreoffice_to_svg(&input, &work))
                    .or_else(|_| eps_to_svg(&input, &work))
            }
        }
    };

    let out = result.map_err(|e| {
        format!(
            "{e}\n\nTips: install Inkscape and/or LibreOffice + poppler-utils (pdftocairo). \
For CorelDRAW, File → Export → SVG/PDF in Corel, then import that. \
Legacy Illustrator: Save as PDF or SVG."
        )
    });

    let _ = fs::remove_dir_all(&work);
    out
}

fn pdf_to_svg(input: &Path, work: &Path) -> Result<ConvertResult, String> {
    if which("pdftocairo") {
        let out_base = work.join("out");
        let status = Command::new("pdftocairo")
            .args(["-svg", "-f", "1", "-l", "1"])
            .arg(input)
            .arg(&out_base)
            .output()
            .map_err(|e| format!("pdftocairo: {e}"))?;
        if !status.status.success() {
            let err = String::from_utf8_lossy(&status.stderr);
            return Err(format!("pdftocairo failed: {err}"));
        }
        // pdftocairo may write out.svg or out
        let svg_path = find_svg(work, "out")?;
        let svg = fs::read_to_string(&svg_path).map_err(|e| e.to_string())?;
        return Ok(ConvertResult {
            svg,
            tool: "pdftocairo".into(),
            message: "Converted with Poppler pdftocairo".into(),
        });
    }
    libreoffice_to_svg(input, work)
}

fn eps_to_svg(input: &Path, work: &Path) -> Result<ConvertResult, String> {
    if which("gs") {
        let pdf = work.join("from_eps.pdf");
        let status = Command::new("gs")
            .args([
                "-q",
                "-dSAFER",
                "-dBATCH",
                "-dNOPAUSE",
                "-sDEVICE=pdfwrite",
                &format!("-sOutputFile={}", pdf.display()),
            ])
            .arg(input)
            .output()
            .map_err(|e| format!("gs: {e}"))?;
        if status.status.success() && pdf.exists() {
            return pdf_to_svg(&pdf, work).map(|mut r| {
                r.tool = format!("gs+{}", r.tool);
                r.message = "Ghostscript → PDF → SVG".into();
                r
            });
        }
    }
    libreoffice_to_svg(input, work).or_else(|_| inkscape_to_svg(input, work))
}

fn inkscape_to_svg(input: &Path, work: &Path) -> Result<ConvertResult, String> {
    if !which("inkscape") {
        return Err("Inkscape not installed".into());
    }
    let out = work.join("ink.svg");
    // Inkscape 1.x CLI
    let status = Command::new("inkscape")
        .arg(input)
        .args(["--export-type=svg", "--export-filename"])
        .arg(&out)
        .output()
        .map_err(|e| format!("inkscape: {e}"))?;
    if !status.status.success() || !out.exists() {
        // Older CLI
        let status2 = Command::new("inkscape")
            .args(["-z", "-l"])
            .arg(&out)
            .arg(input)
            .output()
            .map_err(|e| format!("inkscape legacy: {e}"))?;
        if !status2.status.success() || !out.exists() {
            let err = String::from_utf8_lossy(&status.stderr);
            return Err(format!("Inkscape failed: {err}"));
        }
    }
    let svg = fs::read_to_string(&out).map_err(|e| e.to_string())?;
    Ok(ConvertResult {
        svg,
        tool: "inkscape".into(),
        message: "Converted with Inkscape".into(),
    })
}

fn libreoffice_to_svg(input: &Path, work: &Path) -> Result<ConvertResult, String> {
    let bin = if which("soffice") {
        "soffice"
    } else if which("libreoffice") {
        "libreoffice"
    } else {
        return Err("LibreOffice not installed".into());
    };
    let status = Command::new(bin)
        .args([
            "--headless",
            "--norestore",
            "--convert-to",
            "svg",
            "--outdir",
        ])
        .arg(work)
        .arg(input)
        .output()
        .map_err(|e| format!("{bin}: {e}"))?;
    if !status.status.success() {
        let err = String::from_utf8_lossy(&status.stderr);
        let out = String::from_utf8_lossy(&status.stdout);
        return Err(format!("LibreOffice convert failed: {err} {out}"));
    }
    let svg_path = find_any_svg(work)?;
    let svg = fs::read_to_string(&svg_path).map_err(|e| e.to_string())?;
    Ok(ConvertResult {
        svg,
        tool: "libreoffice".into(),
        message: "Converted with LibreOffice Draw (libcdr for CDR)".into(),
    })
}

fn find_svg(work: &Path, base: &str) -> Result<PathBuf, String> {
    for name in [format!("{base}.svg"), base.to_string()] {
        let p = work.join(&name);
        if p.exists() {
            return Ok(p);
        }
    }
    find_any_svg(work)
}

fn find_any_svg(work: &Path) -> Result<PathBuf, String> {
    let rd = fs::read_dir(work).map_err(|e| e.to_string())?;
    for ent in rd.flatten() {
        let p = ent.path();
        if p.extension().and_then(|e| e.to_str()) == Some("svg") {
            return Ok(p);
        }
    }
    Err("No SVG produced by converter".into())
}

fn extension_of(name: &str) -> String {
    Path::new(name)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase()
}

fn which(cmd: &str) -> bool {
    Command::new("sh")
        .args(["-c", &format!("command -v {cmd} >/dev/null 2>&1")])
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

fn temp_dir() -> Result<PathBuf, String> {
    let n = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let dir = std::env::temp_dir().join(format!("cutforge-import-{n}"));
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}
