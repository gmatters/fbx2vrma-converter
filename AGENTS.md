# Agent Instructions

## Documentation

- Keep `README.md` updated whenever adding, removing, or changing CLI arguments, bone profiles, correction formats, or animation-processing behavior.
- Document whether each processing pass is default-on or opt-in, and document the exact CLI argument that enables or disables it.
- When adding a JSON config format, include a minimal example and list supported `rotationFormat` or equivalent enum values.
- When changing conversion order, update the `How it works` section so it matches the actual pipeline.
- When adding logging for a feature, document the important success/failure messages if they are useful for users to verify behavior.

## Code Changes

- Add or update tests for new bone profiles, correction formats, trimming behavior, rest-pose handling, and VRMA compliance filtering.
- Do not make correction or rest-pose behavior automatic unless explicitly requested; document any default-on behavior clearly.
- Preserve user/sample files in the repository. Do not delete generated FBX/VRMA assets unless the user explicitly asks.
