"""Writes THIRD_PARTY_LICENSES.md (and frontend/src/legal/thirdPartyLicenses.json for the
in-app page): every package that ships with Burrow (the frontend's
runtime dependency tree and the backend's runtime requirements), its version, license
and copyright notice, followed by one copy of each license's text.

Run from the repo root after `npm install` (frontend) and `uv sync` / a backend venv:

    python scripts/generate_third_party_licenses.py

Dev-only tools (TypeScript, Playwright, Prettier, ruff, pytest, ...) are not shipped to
users and are left out. Optional per-operating-system binaries that are not installed
on the machine running this are skipped; they carry their parent package's license.
"""

import importlib.metadata as md
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LICENSE_FILE_NAMES = (
    "LICENSE",
    "LICENSE.md",
    "LICENSE.txt",
    "LICENCE",
    "COPYING",
    "license",
)


def read_text(path: Path) -> str:
    """UTF-8, or Latin-1 for the occasional license file saved that way (so names with accents
    such as "Stüvel" come out right instead of garbled)."""
    data = path.read_bytes()
    try:
        return data.decode("utf-8")
    except UnicodeDecodeError:
        return data.decode("latin-1")


def find_license_text(directory: Path) -> str:
    for name in LICENSE_FILE_NAMES:
        path = directory / name
        if path.is_file():
            return read_text(path)
    for path in directory.glob("LICEN[SC]E*"):
        if path.is_file():
            return read_text(path)
    return ""


def copyright_lines(text: str) -> list[str]:
    lines = []
    for line in text.splitlines():
        stripped = line.strip(" *#/\t")
        # Capitalised "Copyright" only (the Apache text has many lowercase sentences about
        # copyright), and never the "[yyyy] [name of copyright owner]" template line.
        if (
            re.match(r"^(Copyright|©)", stripped)
            and not re.search(r"[\[{]", stripped)
            and len(stripped) < 200
        ):
            if stripped not in lines:
                lines.append(stripped)
    return lines[:4]


def normalise_license(value) -> str:
    if isinstance(value, dict):
        value = value.get("type")
    if isinstance(value, list):
        value = " OR ".join(normalise_license(v) for v in value)
    return str(value or "UNKNOWN").strip()


def frontend_packages() -> list[dict]:
    frontend = ROOT / "frontend"
    out = subprocess.run(
        "npm ls --omit=dev --all --json",
        shell=True,
        cwd=frontend,
        capture_output=True,
        text=True,
    ).stdout
    names: dict[str, str] = {}

    def walk(node: dict) -> None:
        for name, child in (node.get("dependencies") or {}).items():
            names[name] = child.get("version", "")
            walk(child)

    walk(json.loads(out))
    packages = []
    for name, version in sorted(names.items()):
        for base in (frontend / "node_modules", ROOT / "node_modules"):
            directory = base.joinpath(*name.split("/"))
            if (directory / "package.json").is_file():
                meta = json.loads(
                    (directory / "package.json").read_text(encoding="utf-8")
                )
                text = find_license_text(directory)
                packages.append(
                    {
                        "name": name,
                        "version": meta.get("version", version),
                        "license": normalise_license(
                            meta.get("license") or meta.get("licenses")
                        ),
                        "text": text,
                        "where": "frontend",
                    }
                )
                break
    return packages


def backend_packages() -> list[dict]:
    names = sorted(
        {
            re.split(r"[=;\[ ]", line)[0].strip()
            for line in (ROOT / "backend" / "requirements.txt").read_text().splitlines()
            if "==" in line and not line.startswith((" ", "#"))
        }
    )
    packages = []
    for name in names:
        try:
            meta = md.metadata(name)
        except md.PackageNotFoundError:
            continue
        license_name = meta.get("License-Expression") or ""
        if not license_name:
            classifiers = [
                c.split("::")[-1].strip()
                for c in meta.get_all("Classifier") or []
                if c.startswith("License ::")
            ]
            raw = meta.get("License") or ""
            license_name = raw if raw and len(raw) < 60 else "; ".join(classifiers)
        text = ""
        for file in md.files(name) or []:
            if re.search(r"(?i)(^|/)(licen[sc]e|copying)[^/]*$", str(file)):
                text = read_text(Path(file.locate()))
                break
        packages.append(
            {
                "name": name,
                "version": md.version(name),
                "license": license_name or "UNKNOWN",
                "text": text,
                "where": "backend",
            }
        )
    return packages


def main() -> None:
    packages = frontend_packages() + backend_packages()
    distinct: dict[str, str] = {}
    for package in packages:
        if package["text"] and package["license"] not in distinct:
            distinct[package["license"]] = package["text"]

    out = [
        "# Third-party licenses",
        "",
        "Burrow is licensed under the Apache License 2.0 (see `LICENSE`). It includes the "
        "open-source packages below, each under its own license. This file is generated by "
        "`scripts/generate_third_party_licenses.py`; regenerate it when dependencies change.",
        "",
        f"{len(packages)} packages. Frontend packages ship to your browser; backend packages "
        "run only on the server.",
        "",
        "| Package | Version | License | Part | Copyright |",
        "|---|---|---|---|---|",
    ]
    for package in packages:
        notice = (
            "; ".join(copyright_lines(package["text"])).replace("|", "/")
            or "see license"
        )
        out.append(
            f"| {package['name']} | {package['version']} | {package['license']} | "
            f"{package['where']} | {notice} |"
        )
    out += ["", "## License texts", ""]
    for license_name, text in sorted(distinct.items()):
        out += [f"### {license_name}", "", "```text", text.strip(), "```", ""]
    (ROOT / "THIRD_PARTY_LICENSES.md").write_text(
        "\n".join(out) + "\n", encoding="utf-8"
    )
    # The same data for the in-app "Open-source licenses" page
    # (frontend/src/pages/legal/LicensesPage.tsx).
    page_data = {
        "packages": [
            {
                "name": p["name"],
                "version": p["version"],
                "license": p["license"],
                "part": p["where"],
                "copyright": "; ".join(copyright_lines(p["text"])),
            }
            for p in packages
        ],
        "licenses": dict(sorted(distinct.items())),
    }
    (ROOT / "frontend" / "src" / "legal" / "thirdPartyLicenses.json").write_text(
        json.dumps(page_data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    missing = [p["name"] for p in packages if not p["text"]]
    print(f"{len(packages)} packages, {len(distinct)} distinct licenses")
    if missing:
        print("no license file found for:", ", ".join(missing))


if __name__ == "__main__":
    main()
