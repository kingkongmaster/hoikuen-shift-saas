"""Reject source maps in every layer of a docker-save archive, including deleted files.

Usage: python3 tools/release/verify-source-map-free.py image.tar
Reads archives without extracting them; prints counts only.
"""
import json
import sys
import tarfile


def inspect_archive(path):
    layers = set()
    application = dependencies = other = 0
    with tarfile.open(path) as archive:
        manifests = json.load(archive.extractfile("manifest.json"))
        if not manifests:
            raise ValueError("Empty image manifest")
        for manifest in manifests:
            if not manifest.get("Layers"):
                raise ValueError("Missing image layers")
            for name in manifest["Layers"]:
                if name in layers:
                    continue
                layers.add(name)
                with tarfile.open(fileobj=archive.extractfile(name), mode="r|*") as layer:
                    for entry in layer:
                        if entry.isdir() or not entry.name.endswith(".map"):
                            continue
                        if "/node_modules/" in "/" + entry.name:
                            dependencies += 1
                        elif "/app/dist/" in "/" + entry.name:
                            application += 1
                        else:
                            other += 1
    total = application + dependencies + other
    return {"pass": total == 0, "layers": len(layers),
            "application": application, "dependencies": dependencies,
            "other": other, "total": total}


if __name__ == "__main__":
    try:
        result = inspect_archive(sys.argv[1])
    except Exception:
        print(json.dumps({"pass": False, "error": "INVALID_OR_UNREADABLE_IMAGE_ARCHIVE"}))
        sys.exit(2)
    print(json.dumps(result))
    sys.exit(0 if result["pass"] else 1)
