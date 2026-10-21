# VibeUE MCP Pitfalls

Collected from live session failures. Each entry: wrong pattern -> correct pattern + root cause.

> **Audience**: Programmer managing MVVM bindings via MCP.
> UI visual logic (animations, widget layout) is UI Designer territory — not covered here.

---

## 1. BlueprintNodeInfo field names

```python
# Wrong
n.position.x / n.position.y

# Correct
n.pos_x / n.pos_y
n.node_id    # full GUID string
n.node_title
n.node_type  # e.g. "K2Node_Event", "K2Node_CallFunction", "K2Node_CustomEvent"
n.pins       # tuple of BlueprintPinInfo
```

---

## 2. BlueprintPinInfo field names

```python
# Wrong (C++ style)
p.bIsConnected / p.bIsInput / p.PinName / p.PinType / p.DefaultValue

# Correct (Python snake_case)
p.is_connected / p.is_input / p.pin_name / p.pin_type / p.default_value
```

---

## 3. get_nodes_in_graph — no range filter parameter

```python
# Wrong
unreal.BlueprintService.get_nodes_in_graph(bp, graph, start_pos, end_pos)

# Correct — fetch all, filter in Python
nodes  = unreal.BlueprintService.get_nodes_in_graph(bp, graph)
region = [n for n in nodes if 3400 <= n.pos_y <= 4200]
```

---

## 4. Widget BP pin reads — get_node_pins / get_node_details are broken

`get_node_pins()` and `get_node_details()` always return empty for Widget Blueprints.

```python
# Wrong
pins    = unreal.BlueprintService.get_node_pins(bp, graph, node_id)    # always 0
details = unreal.BlueprintService.get_node_details(bp, graph, node_id) # empty

# Correct — read from get_nodes_in_graph results
nodes = unreal.BlueprintService.get_nodes_in_graph(bp, graph)
for n in nodes:
    for p in n.pins:
        print(p.pin_name, p.is_connected, p.is_input)

# For connections use get_connections()
conns = unreal.BlueprintService.get_connections(bp, graph)
# fields: source_node_id, source_pin_name, target_node_id, target_pin_name
```

---

## 5. node_map — always use full IDs as keys

```python
# Wrong — 8-char prefix can collide
node_map = {n.node_id[:8]: n for n in nodes}

# Correct
node_map = {n.node_id: n for n in nodes}

# When only a prefix is known, find full ID once then use it everywhere
full_id = next(n.node_id for n in nodes if n.node_id.startswith("547EC660"))
```

---

## 6. MVVM binding — custom event as destination

`add_view_model_binding()` is for MVVM property bindings only: ViewModel property -> widget component property.
Custom events (`K2Node_CustomEvent`) cannot be destinations.

```python
# Wrong — returns False
unreal.WidgetService.add_view_model_binding(path, "VM", "Prop", "CustomEvent_0", "Condition")

# Correct — MVVMEditorSubsystem + import_text
wb      = unreal.load_asset(bp_path)
mvvm_ed = unreal.get_editor_subsystem(unreal.MVVMEditorSubsystem)
view    = mvvm_ed.get_view(wb)
# Get ContextId from an existing binding, CE GUID = node_id.
# If there is no existing binding, stop; do not fabricate ContextId.
raw_bindings = list(view.get_editor_property("bindings"))
if not raw_bindings:
    raise RuntimeError("No existing MVVM binding; cannot safely derive ContextId.")
ctx_id  = raw_bindings[0].get_editor_property("SourcePath").get_editor_property("ContextId").export_text()
ce_guid = next(n.node_id for n in nodes if "CustomEvent_0" in n.node_title)

b = mvvm_ed.add_binding(wb)
b.import_text(f'(SourcePath=(...MemberName="MyProp"...ContextId={ctx_id}...),'
              f'DestinationPath=(...MemberName="CustomEvent_0",MemberGuid={ce_guid}...))')
blist = list(view.get_editor_property("bindings"))
blist[-1] = b
view.modify()
view.set_editor_property("bindings", blist)
```

Full `make_ce_binding` helper is in `umg-mvvm-binding/skill.md` Workflow G.

---

## 7. MVVMBlueprintViewBinding.SourcePath is read-only

```python
# Wrong
b.set_editor_property("SourcePath", src_path_struct)

# Correct — use import_text to populate, then replace in the array
b.import_text(full_binding_text)
blist = list(view.get_editor_property("bindings"))
blist[-1] = b
view.modify()
view.set_editor_property("bindings", blist)
```

---

## 8. remove_binding — must re-fetch after removal

```python
# Wrong — stale reference
for i in range(len(bindings)-1, 5, -1):
    mvvm_ed.remove_binding(wb, bindings[i])  # bindings not refreshed

# Correct
mvvm_ed.remove_binding(wb, bindings[-1])
bindings = view.get_editor_property("bindings")  # re-fetch

# Simpler alternative
unreal.WidgetService.remove_view_model_binding(path, binding_index)
```

---

## 9. get_graph_definition return structure

```python
# Wrong — treating as dict
gd = unreal.BlueprintService.get_graph_definition(bp, "EventGraph")
gd[0].get('type')  # AttributeError: GraphNodeDesc is not a dict

# Correct — tuple of arrays
nodes_desc = gd[0]  # Array[GraphNodeDesc]
conns_desc = gd[1]  # Array[GraphConnectionDesc]
# GraphNodeDesc: .ref, .type, .params  (params is a Map — use params['key'])
for item in nodes_desc:
    if item.type == 'custom_event':
        print(item.ref, item.params['name'])
```

---

## 10. discover_nodes — new C++ functions not found immediately after build

Action DB is not updated until editor restarts. `discover_nodes()` returns 0 results for new UFUNCTIONs.

```python
# Wrong — returns empty after hot-reload
unreal.BlueprintService.discover_nodes(bp, "NewFunction")

# Correct — add_function_call_node no longer exists in Python; for a function
# on a Blueprint variable use add_function_call_on_variable
node_id = unreal.BlueprintService.add_function_call_on_variable(
    bp, graph, "MyViewModel", "NewFunction", pos_x, pos_y)
# Returns empty string if Action DB still not updated — full editor restart needed.
```

---

## 11. inspect.signature fails on builtins

```python
# Wrong
import inspect
inspect.signature(unreal.BlueprintService.connect_nodes)  # no signature found

# Correct
print(unreal.BlueprintService.connect_nodes.__doc__)
```

---

## 12. Non-existent VibeUE methods

```python
# These do not exist
WidgetService.get_available_components(path)   # use BlueprintService.get_blueprint_info(path).components
WidgetService.save_blueprint(path)             # not available; use compile_blueprint for verification
WidgetService.deep_research(query)             # not available
```

---

## 13. Bulk state collection pattern (minimize MCP calls)

```python
import unreal
# Fetch everything once, filter in Python — no extra MCP calls
nodes     = unreal.BlueprintService.get_nodes_in_graph(bp, graph)
conns     = unreal.BlueprintService.get_connections(bp, graph)
node_map  = {n.node_id: n for n in nodes}
conn_from = {}
for c in conns:
    conn_from.setdefault(c.source_node_id, []).append(c)

ec_node       = next((n for n in nodes if n.node_type == "K2Node_Event" and "Construct" in n.node_title), None)
custom_events = {n.node_title.split('\n')[0].strip(): n.node_id
                 for n in nodes if n.node_type == "K2Node_CustomEvent"}
```

---

## 14. Full custom-event binding procedure

```python
import unreal

bp_path = "/Game/UI/WBP_HUD"
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

def has_matching_output_pin(ce_node, expected_pin_type):
    return any((not p.is_input) and expected_pin_type in str(p.pin_type) for p in ce_node.pins)

def make_ce_binding(vm_class, vm_prop, ce_name, ce_guid, ctx_id):
    return (
        f'(SourcePath=(Paths=((BindingReference=(MemberParent='
        f'"/Script/CoreUObject.Class\'/Script/X7.{vm_class}\'",'
        f'MemberName="{vm_prop}"),BindingKind=Property)),'
        f'WidgetName="",ContextId={ctx_id},Source=ViewModel,'
        f'bIsComponent=False,bDeprecatedSource=True),'
        f'DestinationPath=(Paths=((BindingReference=(MemberName="{ce_name}",'
        f'MemberGuid={ce_guid},bSelfContext=True))),'
        f'WidgetName="",ContextId=00000000000000000000000000000000,'
        f'Source=SelfContext,bIsComponent=False,bDeprecatedSource=True),'
        f'bEnabled=True)'
    )

for vm_prop, expected_pin_type, ce_name in [("IsHoldSkip", "bool", "CustomEvent_0"), ("IsHoldSkip", "bool", "CustomEvent")]:
    ce_node = ce_nodes.get(ce_name)
    if ce_node is None or not has_matching_output_pin(ce_node, expected_pin_type):
        continue
    already = any(vm_prop in b.source_path and ce_name in b.destination_path
                  for b in unreal.WidgetService.list_view_model_bindings(bp_path))
    if already:
        continue
    b = mvvm_ed.add_binding(wb)
    b.import_text(make_ce_binding("SequenceViewModel", vm_prop, ce_name, ce_node.node_id, ctx_id))
    blist = list(view.get_editor_property("bindings"))
    blist[-1] = b
    view.modify()
    view.set_editor_property("bindings", blist)
    print(f"ADDED: {vm_prop} -> {ce_name}")

print("compile:", unreal.BlueprintService.compile_blueprint(bp_path), "- tell user to save in editor if needed")
```

---

## 15. Programmatic save can block on an editor popup

Calling `EditorAssetLibrary.save_asset()` — or running `execute_python_code` with its default `auto_save` (it saves all dirty content first; pass `auto_save="false"`) — can trigger the editor's save or checkout confirmation popup. While that modal is open, MCP may wait or time out (-32000), which looks like the server stopped even though the editor is waiting for user input.

```python
# Avoid as routine finalization: may open a blocking editor popup
unreal.EditorAssetLibrary.save_asset(bp_path)

# Default: compile to verify, then let the user save in the editor if needed
print("compile:", unreal.BlueprintService.compile_blueprint(bp_path))
# Tell user: "Save in the editor if you need to persist this change.
# If a save/checkout popup appears, handle it there before I continue."
```

**Rule**: Do not call programmatic save as routine finalization in MCP Python code. Always compile BP and report the result. If persistence is needed, tell the user to save in the editor and explain that editor popups can make MCP appear stalled. Only attempt programmatic save when the user explicitly requests it and is ready to handle any popup. Do not run UBT as routine MCP finalization; run it only when C++ source/header changes are in scope or the user explicitly requests a build, and announce it first because it may take time.

---

## 16. Default agent scope: MVVM bindings + C++ only

When the user does not explicitly ask for BP graph work, the agent's default task scope is ViewModel registration, MVVM property binding, MvvmButton SetCommand command binding, and C++ FieldNotify definitions. Adding BP EventGraph nodes (function calls, branch nodes, delegates) is outside default scope.

`add_view_model_binding()` is the VibeUE helper for MVVM property bindings only. A SetCommand binding is still MVVM work, but it is a command binding from a ViewModel command getter/member to `UMvvmButton::SetCommand`; do not treat it as a OneWay/TwoWay property sync.

If the user explicitly requests BP graph work (e.g. "wire the button", "connect the event"), load Intent D from `umg-inspect-bind/skill.md` and proceed.

```python
# Outside default scope — only do this when explicitly requested
add_function_call_on_variable(bp, graph, "SequenceViewModel", "OnHoldSkipPressed", x, y)

# Default scope — always applicable
# ViewModel FieldNotify -> MVVM binding
# ViewModel command member -> MvvmButton SetCommand command binding
```

**MVVM bindings do not guarantee execution order.** Each binding handler must be independent.

---

## 17. New FieldNotify property not recognized after hot-reload

After adding a `UPROPERTY(FieldNotify)` in C++, building, and hot-reloading, the MVVM system may not register the new property. Adding a binding via `import_text` results in `None` as the source path.

```python
# After hot-reload — source shows None
b.import_text('(...MemberName="IsHoldSkipDone"...)')
# Result: [7] None -> OnHoldTimeFinish
```

**Fix**: Full editor restart after the build, then add the binding.
Strategy: complete all other binding/node work first, restart editor once, then add the new FieldNotify binding last.

---

## 18. MVVM binding to Custom Event requires a matching parameter pin

A Custom Event used as a MVVM binding destination **must already have a parameter pin whose type matches the source FieldNotify property**. The MVVM system does NOT add the parameter automatically.

```python
# Wrong — binding a bool FieldNotify to a CE with no parameters
# IsHoldSkipDone (bool) -> OnHoldTimeFinish (no params)
# Result: compile error — no matching parameter pin

# Wrong — trying to add parameter via API
unreal.BlueprintService.add_function_parameter(bp, "MyCE", "Value", "float")
# Returns False for Custom Event nodes
```

**How existing CEs have parameters**: they were added manually in the BP editor by the UI designer (not via API or MVVM).

**Correct approach**: Before binding a typed FieldNotify to a CE, check `node.pins` for an output pin matching the property type:
```python
nodes = unreal.BlueprintService.get_nodes_in_graph(bp, "EventGraph")
ce = next(n for n in nodes if "MyCE" in n.node_title and n.node_type == "K2Node_CustomEvent")
print([(p.pin_name, p.pin_type, p.is_input) for p in ce.pins])
# Must have an output pin (is_input=False) matching the source property type
```

**For trigger-only CEs (no data needed)**: Do not bind a typed FieldNotify directly. Options:
- (a) Ask UI designer to add a parameter to the CE in the editor
- (b) Use BP local logic to detect the condition (e.g. Event Tick `CurrentHoldTime >= HoldTime`)
- (c) Use a wrapper CE with the matching parameter type, and call the target CE inside

**Lesson from this session**: `IsHoldSkipDone (bool) → OnHoldTimeFinish` failed because `OnHoldTimeFinish` had no parameters. The BP's Event Tick already handled hold completion independently (`CurrentHoldTime >= HoldTime → call OnHoldTimeFinish`). The FieldNotify was redundant. Removing it was the correct fix.

---

## 19. CE parameter cannot be added via API — use Event Construct for init instead

When a BP variable needs to be initialized from a ViewModel property at widget construction time, and there is no CE with a matching parameter type to bind to, use Event Construct node graph instead:

```python
import unreal

bp_path = "/Game/UI/WBP_HUD"
graph   = "EventGraph"

nodes = unreal.BlueprintService.get_nodes_in_graph(bp_path, graph)
ec    = next(n for n in nodes if n.node_type == "K2Node_Event" and "Construct" in n.node_title and "Pre" not in n.node_title)

# Add init chain: EC -> Get ViewModel -> Get Property -> Set BP Variable
# Spawner keys come from discover_nodes; print the results and pick the matching key.
for term in ("MyViewModel", "MyFloatProp", "Set MyLocalVar"):
    for info in unreal.BlueprintService.discover_nodes(bp_path, term):
        print(term, "->", info.display_name, info.spawner_key)
get_vm_id   = unreal.BlueprintService.create_node_by_key(bp_path, graph, "<key for Get MyViewModel>", 200, ec.pos_y - 80)
get_prop_id = unreal.BlueprintService.create_node_by_key(bp_path, graph, "<key for MyViewModel.MyFloatProp>", 400, ec.pos_y - 80)
set_var_id  = unreal.BlueprintService.create_node_by_key(bp_path, graph, "<key for Set MyLocalVar>", 600, ec.pos_y - 80)

unreal.BlueprintService.connect_nodes(bp_path, graph, ec.node_id, "then", set_var_id, "execute")
unreal.BlueprintService.connect_nodes(bp_path, graph, get_vm_id, "MyViewModel", get_prop_id, "self")
unreal.BlueprintService.connect_nodes(bp_path, graph, get_prop_id, "MyFloatProp", set_var_id, "MyLocalVar")
```

This reads a ViewModel property (not a function call) — acceptable when MVVM binding to a CE is impossible.

**Note**: If the EC `then` pin is already connected, insert the new node between existing connections rather than replacing them.
