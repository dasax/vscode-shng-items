# Changelog

## 0.1.1

- Package now includes the license file
- Links to the GitHub repository, issues and homepage

## 0.1.0

First public version.

- Item tree with resolved structs (items/, structs/, etc/struct*.yaml, plugin structs), hover, go to definition, diagnostics
- Item overview table
- Filter chips: one per configured plugin (from `etc/plugin.yaml` + `item_attributes`), additional categories (eval, timers, cache), item types
- Search with pattern matching (`baddim` → `eg.bad.licht.spiegel.dimmen`), ranking by fragments/word starts, filtered-out hits below a separator
- Autocomplete in `items/*.yaml`, `structs/*.yaml` and `logics/*.py`: child items, attributes (core + plugins), values, absolute and relative item paths
- KNX: group address suggestions, DPT and hover from the ETS project (`shngItems.knxProject`)
