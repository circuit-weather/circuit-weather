import re

with open('tests/privacy-modal.test.js', 'r') as f:
    content = f.read()

content = content.replace("clickHandler();", "clickHandler({ preventDefault: vi.fn() });")

with open('tests/privacy-modal.test.js', 'w') as f:
    f.write(content)
