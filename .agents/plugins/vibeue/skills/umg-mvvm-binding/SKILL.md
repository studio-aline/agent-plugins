---
name: umg-mvvm-binding
description: Register MVVM ViewModels and manage property bindings and MvvmButton SetCommand command bindings on a Widget Blueprint through the VibeUE Unreal Engine MCP server. Use for ViewModel registration, property/command binding requests, and binding verification.
---

# UMG MVVM Binding

> | Role | Responsibility |
> |------|----------------|
> | **Programmer** | Define FieldNotify properties, register MVVM bindings (this skill) |
> | **UI Designer** | BP event graph logic, animations, widget layout (editor direct work) |
>
> **Default task scope (no explicit request): MVVM property bindings, MvvmButton
> SetCommand command bindings, and C++ only.** Do not add BP EventGraph nodes as
> part of standard MVVM binding work. ViewModel state reaches BP only through
> MVVM bindings by default.
> If the user explicitly asks for BP graph work (e.g. button event wiring,
> inserting branch nodes), use Intent D in `../umg-inspect-bind/SKILL.md`.
>
> **MVVM bindings do not guarantee execution order.** When a single FieldNotify
> change fires multiple bindings, order is undefined. Each handler must be
> independent.

Use this skill for ViewModel registration, MVVM property binding mode
selection, SetCommand command binding, and binding verification.

For mixed inspect+bind requests, start with `../umg-inspect-bind/SKILL.md`.

## Step 0 — Activate VibeUE MCP Tools

1. Confirm the VibeUE MCP tools `execute_python_code` and `call_tool` are
   visible. If not, load them through this host's MCP/tool discovery mechanism
   before anything else (e.g. `tool_search(query="vibeue execute_python_code")`
   for a Codex-style deferred tool list). With Unreal 5.8+ VibeUE is an
   expansion of Unreal's native MCP server: its services are reached with
   `execute_python_code` (`unreal.<Name>Service.<method>()`) or
   `call_tool(toolset_name="VibeUE.<Name>Service", ...)`; there is no
   `manage_asset` tool.
2. Confirm an Unreal Editor instance with VibeUE loaded is running and
   reachable. If not, report the prerequisite to the user and stop.
3. Do NOT parse `.uasset` binary files with file search, grep, Python, or
   manual binary inspection.

## API Field Name Reference

**BlueprintNodeInfo** (from `get_nodes_in_graph()`):
- `node_id` (full GUID), `node_title`, `node_type`, `pos_x`, `pos_y`, `pins`
- NOT `.position.x / .position.y`

**BlueprintPinInfo** (from `node.pins`):
- `pin_name`, `pin_type`, `is_input`, `is_connected`, `default_value`
- NOT `.PinName`, `.bIsInput`, `.bIsConnected`, `.DefaultValue`

**BlueprintConnectionInfo** (from `get_connections()`):
- `source_node_id`, `source_pin_name`, `target_node_id`, `target_pin_name`

**Widget BP pin reads**: use `node.pins` only. `get_node_pins()` and
`get_node_details()` return empty for Widget Blueprints.

**No range filter in `get_nodes_in_graph`**: filter by `pos_y` in Python after
fetching all.

**node_map must use full IDs**: never use `node_id[:8]` as a dict key.

---

## Critical Rules

### 1) Resolve pathless BP names first

Search the AssetRegistry with `execute_python_code` (the engine's AssetTools
toolset may not be enabled, so do not depend on it):

```python
import unreal
ar = unreal.AssetRegistryHelpers.get_asset_registry()
flt = unreal.ARFilter(
    class_paths=[unreal.TopLevelAssetPath("/Script/UMGEditor", "WidgetBlueprint")],
    recursive_classes=True)
for a in ar.get_assets(flt):
    if "<name>".lower() in str(a.asset_name).lower():
        print(a.package_name)   # WidgetService path
```

Use `package_name` from a `WidgetBlueprint` result.

### 2) Single-call preflight

```python
import unreal
path = "/Game/UI/WBP_HUD"
vms      = unreal.WidgetService.list_view_models(path)
bindings = unreal.WidgetService.list_view_model_bindings(path)
nodes    = unreal.BlueprintService.get_nodes_in_graph(path, "EventGraph")
conns    = unreal.BlueprintService.get_connections(path, "EventGraph")
```

### 3) Register ViewModel before binding

`add_view_model(...)` must succeed before any `add_view_model_binding(...)`
property binding or MvvmButton SetCommand command binding.

### 4) Property binding mode by intent

- Binding modes apply to MVVM property value synchronization only.
- Do not choose `OneWayToDestination`, `TwoWay`, or `OneTimeToDestination` for
  MvvmButton SetCommand command bindings.
- Display-only: `OneWayToDestination`
- User-editable: `TwoWay`
- Init-only: `OneTimeToDestination`

### 5) Treat MvvmButton SetCommand as default MVVM command binding

- `UMvvmButton::SetCommand(FMvvmCommand)` is the standard button command
  interface, not BP EventGraph node work.
- A SetCommand binding is an MVVM command binding: ViewModel command
  getter/member → `UMvvmButton::SetCommand`.
- It is established when the ViewModel binding is applied; it is not
  OneWay/TwoWay property value synchronization.
- Apply a SetCommand binding automatically when the target `UMvvmButton`,
  ViewModel alias, and command getter/member are uniquely identified.
- The ViewModel command member must return `FMvvmCommand` or a compatible
  command struct expected by the target command setter.
- If the direct MvvmButton command binding path is unavailable in the current
  MCP/API surface, stop and report the missing prerequisite or unsupported
  widget type.
- Do not fall back to widget event → Blueprint function wiring unless the user
  explicitly asks for BP EventGraph wiring.

### 6) Use exact reflection property names

- For full hierarchy/slot/property inspection, use `get_widget_snapshot(path)`.
- For binding destination checks on a known widget, use
  `get_component_properties(path, widget_name)`.
- Use `list_properties(path, widget_name)` only as an editable-property
  fallback.

### 7) After mutation: compile BP and report; avoid routine save/UBT finalization

```python
# Always compile BP after mutation and report the result.
result = unreal.BlueprintService.compile_blueprint(path)
print(f"compile: errors={result.num_errors} warnings={result.num_warnings}")
if result.errors: print(result.errors)
# Then tell the user to save in the editor if persistence is needed.
# Avoid save_asset as routine finalization: it can open an editor popup,
# making MCP look stalled until the user handles the popup.
# Do not run UBT as routine verification. Run it only for in-scope C++ changes
# or explicit user request, and announce it first because it may take time.
```

---

## Binding Mode Matrix

| UI Case | Mode |
|--------|------|
| HealthPercent → ProgressBar.Percent | `OneWayToDestination` |
| ScoreText → TextBlock.Text | `OneWayToDestination` |
| Volume → Slider.Value | `TwoWay` |
| PlayerName → EditableTextBox.Text | `TwoWay` |
| Init seed only | `OneTimeToDestination` |

---

## Workflows

### Workflow A: Single-call Preflight
```python
import unreal
path = "/Game/UI/WBP_HUD"
vms      = unreal.WidgetService.list_view_models(path)
bindings = unreal.WidgetService.list_view_model_bindings(path)
nodes    = unreal.BlueprintService.get_nodes_in_graph(path, "EventGraph")
conns    = unreal.BlueprintService.get_connections(path, "EventGraph")
print("VMs:", [(v.view_model_name, v.view_model_class_name) for v in vms])
print("Bindings:", [(b.source_path, b.destination_path) for b in bindings])
print("CustomEvents:", [(n.node_id, n.node_title.split()[0]) for n in nodes if n.node_type == "K2Node_CustomEvent"])
```

### Workflow B: Add ViewModel
```python
import unreal
path = "/Game/UI/WBP_HUD"
ok = unreal.WidgetService.add_view_model(path, "GameHUDViewModel", "HudVM", "CreateInstance")
print("ADDED_VIEWMODEL:", ok)
result = unreal.BlueprintService.compile_blueprint(path)
print(f"compile: errors={result.num_errors} warnings={result.num_warnings}")
```

### Workflow C: Add MVVM Property Binding

`add_view_model_binding` is the VibeUE helper for MVVM property bindings only:
ViewModel property → widget component property. For MvvmButton SetCommand
command binding use Workflow F. For custom event destinations use Workflow G.

```python
import unreal
path = "/Game/UI/WBP_HUD"
ok = unreal.WidgetService.add_view_model_binding(
    path, "HudVM", "HealthPercent", "HealthBar", "Percent", "OneWayToDestination"
)
print("BIND:", ok)
# Returns False when: ViewModel alias missing | widget not found | destination is custom event
for b in unreal.WidgetService.list_view_model_bindings(path):
    print(f"[{b.binding_index}] {b.source_path} -> {b.destination_path} ({b.binding_mode})")
result = unreal.BlueprintService.compile_blueprint(path)
print(f"compile: errors={result.num_errors} warnings={result.num_warnings}")
```

### Workflow D: Idempotent Upsert

`list_view_model_bindings` only returns property names (`source_path` is the
ViewModel property, `destination_path` is the widget property); it does NOT
include the ViewModel alias or the widget name, so two widgets with the same
property look identical. Check for an existing binding through the raw MVVM
binding text instead (it carries `WidgetName`):

```python
import re
import unreal
path = "/Game/UI/WBP_HUD"

def binding_exists(path, vm_prop, widget, widget_prop):
    view = unreal.get_editor_subsystem(unreal.MVVMEditorSubsystem).get_view(unreal.load_asset(path))
    pat = re.compile(
        r'SourcePath=\(Paths=\(\(BindingReference=\([^)]*?MemberName="%s"' % re.escape(vm_prop)
        + r'.*?DestinationPath=\(Paths=\(\(BindingReference=\([^)]*?MemberName="%s"' % re.escape(widget_prop)
        + r'.*?WidgetName="%s"' % re.escape(widget))
    return any(pat.search(b.export_text()) for b in view.get_editor_property("bindings"))

vms = unreal.WidgetService.list_view_models(path)
if not any(v.view_model_name == "HudVM" for v in vms):
    print("CREATED_VM:", unreal.WidgetService.add_view_model(path, "GameHUDViewModel", "HudVM", "CreateInstance"))
if not binding_exists(path, "HealthPercent", "HealthBar", "Percent"):
    print("CREATED_BIND:", unreal.WidgetService.add_view_model_binding(
        path, "HudVM", "HealthPercent", "HealthBar", "Percent", "OneWayToDestination"))
result = unreal.BlueprintService.compile_blueprint(path)
print(f"compile: errors={result.num_errors} warnings={result.num_warnings}")
```

### Workflow E: Remove Binding by Index
```python
import unreal
path = "/Game/UI/WBP_HUD"
for b in unreal.WidgetService.list_view_model_bindings(path):
    print(f"[{b.binding_index}] {b.source_path} -> {b.destination_path}")
print("REMOVED:", unreal.WidgetService.remove_view_model_binding(path, 0))
result = unreal.BlueprintService.compile_blueprint(path)
print(f"compile: errors={result.num_errors} warnings={result.num_warnings}")
```

### Workflow F: MvvmButton SetCommand

Use when the user asks to bind a `UMvvmButton` to a ViewModel command, or when
a delegated MVVM task has one obvious missing SetCommand command binding.

Preflight before writing:

1. Confirm the target widget is a `UMvvmButton` or subclass exposing
   `SetCommand(FMvvmCommand)`.
2. Confirm the ViewModel alias is already registered, or register the single
   unambiguous missing alias first.
3. Confirm the command member returns `FMvvmCommand` or a compatible command
   struct.
4. Confirm there is no existing equivalent SetCommand command binding.
5. Apply an MVVM command binding from the ViewModel command member to the
   target widget's `SetCommand`.
6. Do not choose a property binding mode; SetCommand is not OneWay/TwoWay
   value synchronization.
7. If the active tooling cannot write that MVVM command binding directly, stop
   and report the prerequisite. Do not create BP EventGraph event wiring as a
   fallback.
8. Compile the Blueprint and report applied/skipped/blocked status.

### Workflow G: ViewModel Property → Custom Event (MVVMEditorSubsystem)

Use when `add_view_model_binding` returns False because the destination is
`K2Node_CustomEvent`.

Preflight before writing:

1. Confirm the destination Custom Event exists in `get_nodes_in_graph()`.
2. Confirm the Custom Event already has an output pin whose type matches the
   source FieldNotify property. Do not add CE parameters through the API.
3. Confirm the exact ViewModel class reference. Do not assume a project's
   default script package unless the ViewModel is a native class in it.
4. Confirm at least one existing MVVM binding exists to derive `ContextId`. If
   no binding exists, stop and report that a normal widget-property binding or
   manual BP/MVVM setup is needed first.
5. If any preflight check fails, do not invent an EventGraph workaround unless
   the user explicitly requested node-level work.

```python
import unreal

bp_path = "/Game/UI/WBP_HUD"

# Collect all IDs in one call
wb      = unreal.load_asset(bp_path)
mvvm_ed = unreal.get_editor_subsystem(unreal.MVVMEditorSubsystem)
view    = mvvm_ed.get_view(wb)
nodes   = unreal.BlueprintService.get_nodes_in_graph(bp_path, "EventGraph")

raw_bindings = list(view.get_editor_property("bindings"))
if not raw_bindings:
    raise RuntimeError("No existing MVVM binding; cannot safely derive ContextId.")
ctx_id = raw_bindings[0].get_editor_property("SourcePath").get_editor_property("ContextId").export_text()

ce_nodes = {n.node_title.split('\n')[0].strip(): n
            for n in nodes if n.node_type == "K2Node_CustomEvent"}
print("ContextId:", ctx_id)
print("CustomEvents:", list(ce_nodes.keys()))

def has_matching_output_pin(ce_node, expected_pin_type):
    return any((not p.is_input) and expected_pin_type in str(p.pin_type) for p in ce_node.pins)

def make_ce_binding(vm_class_ref, vm_prop, ce_name, ce_guid, ctx_id):
    return (
        f'(SourcePath=(Paths=((BindingReference=(MemberParent='
        f'{vm_class_ref},'
        f'MemberName="{vm_prop}"),BindingKind=Property)),'
        f'WidgetName="",ContextId={ctx_id},Source=ViewModel,'
        f'bIsComponent=False,bDeprecatedSource=True),'
        f'DestinationPath=(Paths=((BindingReference=(MemberName="{ce_name}",'
        f'MemberGuid={ce_guid},bSelfContext=True))),'
        f'WidgetName="",ContextId=00000000000000000000000000000000,'
        f'Source=SelfContext,bIsComponent=False,bDeprecatedSource=True),'
        f'bEnabled=True)'
    )

# Replace with exact targets. vm_class_ref must be the quoted class reference from reflection.
# expected_pin_type is matched against str(pin.pin_type): a float/double property
# reports "real" (not "float"). Print the CE node's pins first when unsure.
targets = [
    ('"/Script/CoreUObject.Class\'/Script/YourModule.MyViewModel\'"', "MyProp", "bool", "MyCE"),
]

for vm_class_ref, vm_prop, expected_pin_type, ce_name in targets:
    ce_node = ce_nodes.get(ce_name)
    if ce_node is None:
        print(f"SKIP: {ce_name} not found"); continue
    if not has_matching_output_pin(ce_node, expected_pin_type):
        print(f"SKIP: {ce_name} has no matching {expected_pin_type} output pin"); continue
    already = any(vm_prop in b.source_path and ce_name in b.destination_path
                  for b in unreal.WidgetService.list_view_model_bindings(bp_path))
    if already:
        print(f"SKIP (exists): {vm_prop} -> {ce_name}"); continue
    b = mvvm_ed.add_binding(wb)
    b.import_text(make_ce_binding(vm_class_ref, vm_prop, ce_name, ce_node.node_id, ctx_id))
    blist = list(view.get_editor_property("bindings"))
    blist[-1] = b
    view.modify()
    view.set_editor_property("bindings", blist)
    print(f"ADDED: {vm_prop} -> {ce_name}")

result = unreal.BlueprintService.compile_blueprint(bp_path)
print(f"compile: errors={result.num_errors} warnings={result.num_warnings} - tell user to save in editor if needed")
```

---

## Common Failures

| Symptom | Cause | Fix |
|---------|-------|-----|
| `add_view_model_binding` returns False | VM alias missing | call `add_view_model()` first |
| `add_view_model_binding` returns False | destination is custom event | use Workflow G |
| SetCommand request blocked | target is not MvvmButton, command member is not compatible, or active tooling cannot write MVVM command binding | report the prerequisite; do not create BP EventGraph fallback unless explicitly requested |
| Custom Event binding has no ContextId source | no existing MVVM binding | stop and report setup prerequisite; do not fabricate ContextId |
| Custom Event binding compile fails | CE has no matching output parameter pin | ask the UI Designer/BP editor to add the parameter or choose an explicit node-level workflow |
| binding source shows `None` | new FieldNotify not registered after hot-reload | full editor restart, then add binding |
| `remove_binding` does not reduce count | stale reference after MVVMEditorSubsystem call | re-fetch `view.get_editor_property("bindings")` after removal |
| MCP timeout -32000 | programmatic save opened an editor popup | tell user to resolve the popup; avoid routine `save_asset` finalization |
| Long/blocking validation | UBT build invoked as routine MCP finalization | avoid routine UBT; run only for in-scope C++ changes or explicit user request, and announce before starting |
| ViewModel function not visible in BP | header signature changed (new UFUNCTION, added/removed BlueprintCallable) | requires full editor restart — hot-reload only picks up function body changes; tell the user to restart the editor |

---

## C++ / Hot-Reload Boundary

- **Hot-reload applies to**: function body changes only (`*.cpp`)
- **Full editor restart required for**:
  - New `UFUNCTION(BlueprintCallable)` added or removed
  - New `UPROPERTY(FieldNotify)` added
  - Any header (`*.h`) signature change
- **C++ compile rule**: C++/UBT compile is valid verification when C++
  source/header changes are in scope, but it is not part of routine UMG/MVVM
  MCP finalization. Announce before running it; if skipped or deferred, report
  why.
- **Agent rule**: if a BP step requires a C++ header change, finish the C++
  edit, then tell the user to restart the editor before proceeding with BP
  node work. Do not attempt the BP step until the user confirms the editor has
  restarted.

---

## API Quick Reference

| Method | Purpose |
|-------|---------|
| `list_view_models(path)` | Read registered ViewModels |
| `add_view_model(path, class, name, creation_type)` | Register ViewModel alias |
| `remove_view_model(path, name)` | Remove ViewModel alias |
| `list_view_model_bindings(path)` | Read current bindings |
| `add_view_model_binding(path, vm, vm_prop, widget, widget_prop, mode)` | Create MVVM property binding only |
| `remove_view_model_binding(path, index)` | Remove binding by index |
| `get_component_properties(path, widget)` | Discover destination property names |
| `compile_blueprint(path)` | Compile BP after mutation — always run and report |
| MvvmButton SetCommand command binding | Bind ViewModel command member to `UMvvmButton::SetCommand`; not property-mode sync and not BP EventGraph work |

## Companion References

- `../umg-inspect-bind/SKILL.md`: hierarchy inspection, reference expansion, direct Blueprint node wiring
- `../../references/vibeue-mcp-pitfalls.md`: full API field names, return types, known failure patterns
- `../../references/mvvm-checklist.md`: condensed preflight/apply/verify checklist
- `../../references/tool-contracts.md`: operational contracts for path resolution and verification
- `../../references/troubleshooting.md`: runtime failure diagnosis
- `../../references/maintenance-examples.md`: prompt examples and regression checks
