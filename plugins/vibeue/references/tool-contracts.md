# VibeUE Tool Contracts

Operational contracts for reliable VibeUE tool usage.

## Widget Blueprint Path Contract

When user input is a name without `/Game/...` path:

1. Resolve with an AssetRegistry search through `execute_python_code`
   (`ar.get_assets(unreal.ARFilter(class_paths=[unreal.TopLevelAssetPath("/Script/UMGEditor", "WidgetBlueprint")], recursive_classes=True))`,
   then filter by `asset_name`).
2. Select a `WidgetBlueprint` result.
3. Use `package_name` as WidgetService path.
4. If multiple candidates exist, ask user to pick one by folder/path.

Verified example:

- Input: `questpanelviewbp`
- Resolved `package_name`: `/Game/A_X7_UI/UI_Widgets/Quest/QuestPanelViewBP`

## Hierarchy Inspection Contract

For UI inspection requests:

1. Prefer `get_widget_snapshot(path)` over fragmented calls.
2. Return hierarchy and properties together in one report.
3. Keep this phase read-only unless mutation intent is explicit.

## Property Discovery Contract

1. For full hierarchy, slot, and property inspection, prefer `get_widget_snapshot(path)`.
2. For binding destination checks on a known widget, prefer `get_component_properties(path, widget_name)`.
3. Use `list_properties(path, widget_name)` only as an editable-property fallback or when comparing against plugin fallback documentation.

## BP Reference Expansion Contract

When request asks to expand dependency/referencer relationships:

1. Expand graph only when the user explicitly asks for dependency/referencer analysis.
2. For binding-only mutation requests, skip graph expansion and continue with lightweight preflight.
3. If graph expansion is requested, query both directions from the resolved BP path:
   - `ar.get_dependencies(package_name, opts)`
   - `ar.get_referencers(package_name, opts)`
     (`ar = unreal.AssetRegistryHelpers.get_asset_registry()`; `AssetDiscoveryService` no longer provides these)
4. Use deterministic staged traversal with:
   - first pass default depth limit: 1
   - first pass default max nodes: 80
   - optional escalation depth limit: 2 and max nodes: 200 only for explicit full-graph requests
   - visited-set deduplication
5. If limits are reached, mark output as truncated instead of guessing.
6. If expansion call stalls or times out, retry once at most, then stop expansion and report partial status.
7. Treat this graph as hard-reference graph unless explicitly stated otherwise.

## AssetData Introspection Safety Contract

When filtering dependencies by asset class in UE Python:

1. Do not read `AssetData.asset_class`.
   - In this workspace/runtime, deprecation warnings can be surfaced as runtime errors.
2. Use `AssetData.asset_class_path` and compare its `asset_name` (for example `WidgetBlueprint`).
3. Do not assume `AssetData.object_path` exists.
   - Prefer `package_name`, `package_path`, or `to_soft_object_path()` for path serialization.
4. If an attribute is version-dependent, probe with `hasattr(...)` only for non-deprecated fields.

## Semi-Autonomous Apply Contract

For requests where user delegates scoped decisions to the agent:

1. Interpret "handle it", "if needed", "decide and apply", and equivalent Korean delegation phrasing as limited autonomous delegation.
2. Execute deterministic workflow automatically when there is exactly one safe target.
3. Do not guess among multiple BP, widget, ViewModel, source property, destination property, command member, or binding-mode candidates.
4. Ask once only when ambiguity blocks safe mutation.
5. Apply minimal changes: add missing ViewModel aliases and missing MVVM bindings only.
6. MVVM property bindings require an unambiguous source property, destination widget property, and binding mode.
7. MvvmButton SetCommand command bindings require an unambiguous target MvvmButton, ViewModel alias, and command getter/member returning `FMvvmCommand` or a compatible command struct.
8. For binding-only requests, skip dependency/referencer expansion.
9. For explicit reference expansion, use depth 1 / max 80 first; escalate to depth 2 / max 200 only for explicit full-graph requests.
10. Do not create BP graph nodes unless the user explicitly asks for button event wiring, delegate binding, branch insertion, or similar node-level work. MvvmButton SetCommand is normal MVVM command binding and may be applied when unambiguous.

## Mutation Verification Contract

After ViewModel or binding mutations:

1. Re-read `list_view_models(path)`.
2. Re-read `list_view_model_bindings(path)`.
3. For property bindings, confirm expected source property, destination widget property, and mode exist.
4. For SetCommand command bindings, confirm the expected ViewModel command member is bound to the target MvvmButton command setter.
5. Compile the Blueprint with `compile_blueprint(path)`.
6. Report compile errors/warnings and applied/skipped actions.
7. Tell the user to save in the editor if persistence is needed.
8. Avoid routine programmatic saves (`save_asset`, `save_all_assets`, or leaving `execute_python_code`'s default `auto_save` on). Programmatic save can open a blocking editor popup; only attempt it when explicitly requested and the user is ready to handle the popup.
9. Do not run UBT as routine VibeUE verification. Run it only when C++ source/header changes are in scope or the user explicitly requests a build; announce it first because it may take time.

## MVVM Binding Contract

- `add_view_model_binding(...)` is the VibeUE helper for MVVM property bindings only: ViewModel property -> widget property.
- MVVM property bindings sync values and require a binding mode (`OneWayToDestination`, `TwoWay`, etc.).
- MvvmButton SetCommand is an MVVM command binding: ViewModel command getter/member -> `UMvvmButton::SetCommand`.
- SetCommand command bindings are established when the ViewModel binding is applied; do not choose a OneWay/TwoWay property-sync mode for them.
- Static/default values: use `set_property`.
- Full style structs: use `set_font` and `set_brush`.

## Binding Mode Contract

- Binding modes apply to MVVM property bindings, not SetCommand command bindings.
- `OneWayToDestination`: display-only values.
- `TwoWay`: user-editable controls.
- `OneTimeToDestination`: one-shot initial sync.

## SetCommand Intent Contract

When user asks for "SetCommand":

1. Interpret it as an MVVM command binding through the widget's standard command interface: ViewModel command getter/member -> `UMvvmButton::SetCommand`.
2. Treat unambiguous MvvmButton SetCommand as normal MVVM binding work, not BP EventGraph node work.
3. Do not route SetCommand through the property-binding mode matrix; it is not OneWay/TwoWay value synchronization.
4. Apply it automatically when the target button, ViewModel alias, and command getter/member are uniquely identified.
5. If direct MvvmButton command binding is not available, stop and report the missing prerequisite or unsupported widget type.
6. Do not fall back to binding widget events to Blueprint functions unless the user explicitly asks for BP EventGraph wiring.
7. Report whether SetCommand was applied, skipped as already present, or blocked by an ambiguity/prerequisite.
