#!/usr/bin/env python3
import os
import sys
import json
import zipfile

root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
dist_dir = os.path.join(root_dir, 'dist')
os.makedirs(dist_dir, exist_ok=True)

manifest_path = os.path.join(root_dir, 'manifest.json')
with open(manifest_path, 'r', encoding='utf-8') as f:
    manifest = json.load(f)

version = manifest.get('version', '1.0.0')
zip_name = f"ai-safe-web-surfing-v{version}.zip"
zip_path = os.path.join(dist_dir, zip_name)

print(f"📦 Packaging extension v{version} into {zip_name}...")

include_files = [
    "manifest.json",
    "rules.json",
    "background.js",
    "website-score.js",
    "safety-warning.js",
    "content.js",
    "content.css",
    "test-ad-page.html",
    "README.md"
]

include_dirs = [
    "icons",
    "popup",
    "options"
]

with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as z:
    for f in include_files:
        fpath = os.path.join(root_dir, f)
        if os.path.exists(fpath):
            z.write(fpath, f)
            print(f"  + {f}")
    for d in include_dirs:
        dpath = os.path.join(root_dir, d)
        for dirpath, _, filenames in os.walk(dpath):
            for file in filenames:
                if not file.startswith('.'):
                    full_p = os.path.join(dirpath, file)
                    arc_p = os.path.relpath(full_p, root_dir)
                    z.write(full_p, arc_p)
                    print(f"  + {arc_p}")

size_kb = os.path.getsize(zip_path) / 1024
print(f"✅ Extension package successfully created at: {zip_path} ({size_kb:.1f} KB)")
