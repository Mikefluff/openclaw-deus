# Skills Scaffold

`clean-install` does not ship bundled skills.

This directory is intentionally scaffold-only in the public baseline.
Any skill pack or skill-specific reference set must be materialized explicitly after installation, not bundled by default.

Rule:
- DEUS core is the canonical install surface.
- Skills are optional overlays on top of that core.
- If a local operator wants skills, they should install or materialize them on demand in their own workspace flow.
