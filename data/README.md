# Data Scaffold

`clean-install` does not ship live mutable data markers.

This directory exists so runtime state can be initialized naturally.
Local markers such as extraction checkpoints should be created during execution, not published as starter residue.
