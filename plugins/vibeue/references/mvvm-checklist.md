# UMG MVVM Checklist

Use this checklist when applying MVVM changes.

## Preflight

1. Resolve widget path if input is name-only.
2. Confirm widget exists.
3. Read current widget snapshot.
4. Read existing ViewModels and bindings.
5. For property-binding destination property names, use `get_component_properties(path, widget_name)` first.
6. For MvvmButton SetCommand command bindings, confirm the target widget is a MvvmButton and the ViewModel command getter/member returns `FMvvmCommand` or a compatible command struct.

## Apply

1. Add ViewModel if missing.
2. Add MVVM property bindings with explicit mode selection.
3. Add MvvmButton SetCommand command bindings without choosing a property binding mode.

## Verify

1. For property bindings, confirm binding list contains expected source path.
2. For property bindings, confirm binding list contains expected destination path.
3. For property bindings, confirm binding mode is correct.
4. For SetCommand command bindings, confirm the ViewModel command member is bound to the target MvvmButton command setter.
5. Compile the Blueprint and report errors/warnings.
6. Tell the user to save in the editor if persistence is needed.
7. Avoid routine programmatic saves (`save_asset`, `save_all_assets`; pass `auto_save="false"` to `execute_python_code`); programmatic save can open a blocking editor popup.

## Fast Failure Hints

- "ViewModel not found": add ViewModel first.
- "Property not found on ViewModel": check source property exact name.
- "Property not found on widget": use `get_component_properties(path, widget_name)` first; use `list_properties(path, widget_name)` only as an editable-property fallback.
- Wrong runtime behavior with successful bind: re-check binding mode choice.
- SetCommand request asks for OneWay/TwoWay: treat it as a MvvmButton command binding instead; binding modes apply only to property value synchronization.
