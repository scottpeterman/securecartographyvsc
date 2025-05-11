# Network Discovery Templates

This directory contains parsing templates for the network discovery tool.

## Directory Structure

- `regex/`: Regular expression templates (*.regex files)
- `textfsm/`: TextFSM templates (*.textfsm files)  
- `ttp/`: TTP (Template Text Parser) templates (*.ttp files)

## Template Format

Each template file should start with a comment line containing priority and name:
```
# priority, template_name
```

For example:
```
# 1, cisco_cdp_detail
```

Priority determines the order templates are tried (lower number = higher priority).

## Adding New Templates

1. Create a file with the appropriate extension in the correct directory
2. Add the priority and name comment at the top
3. Write your template according to the format (regex, TextFSM, or TTP)
4. The tool will automatically load new templates on startup

## Examples

See the default templates for examples of each format.
