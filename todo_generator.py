import os
import json
import re

def main():
    account = "circuit-weather"
    project = "circuit-weather"
    hash_val = "b2e45eda1b11c116514f4e93c667a56a8a675b9c"

    # We are only looking for comments containing "TODO" (plus the other ones specified if any, but the prompt says 'TODO-like items', we'll focus on TODO as per the prompt instructions "look for common TODO markers (case-insensitive): TODO, FIXME, FIX, BUG, HACK, XXX").
    pattern = re.compile(r"^[ \t]*([#/]+|/\*).*?(?<=\s)(TODO|FIXME|FIX|BUG|HACK|XXX)\b[\s:-]", re.IGNORECASE)

    # Let's do a strict matching to make sure they are within line comments or block comments and preceded by at least one whitespace character as the prompt said.
    # The prompt actually said:
    # "These markers should appear within line comments (e.g., starting with #, //) or block comments, and be preceded by at least one whitespace character."

    grep_pattern = re.compile(r"[ \t]+([#/]+|/\*).*?(?<=\s)(TODO|FIXME|FIX|BUG|HACK|XXX)\b[\s:-]", re.IGNORECASE)

    extensions = (".py", ".ts", ".js", ".java", ".html", ".css")

    results = []

    for root, _, files in os.walk("."):
        if ".git" in root or "node_modules" in root:
            continue

        for file in files:
            if file.endswith(extensions):
                filepath = os.path.join(root, file)
                try:
                    with open(filepath, "r", encoding="utf-8") as f:
                        for i, line in enumerate(f):
                            if grep_pattern.search(line):
                                results.append({
                                    "file": filepath,
                                    "line": i + 1,
                                    "content": line.strip()
                                })
                except Exception as e:
                    pass

    with open("todos.json", "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)

    print(f"Found {len(results)} TODO items.")

if __name__ == "__main__":
    main()
