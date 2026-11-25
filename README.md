# Lorebook Organizer (SillyTavern)

Version: 0.1.0

A third-party SillyTavern extension that adds a separate organizer window for:
- Lorebook-level nested folders
- Entry-level nested folders
- Search
- Moving Lorebooks and Entries between folders
- Renaming and deleting folders
- Responsive dark UI

## Install

1. Extract `lorebook-organizer.zip`.
2. Copy the `lorebook-organizer` folder into:
   `SillyTavern/public/scripts/extensions/third-party/`
3. Restart SillyTavern (or reload the page after the server is ready).
4. Open Extensions and find **Lorebook Organizer**.
5. Click **Open Organizer**.

Alternatively, install as a third-party extension from a Git repository after publishing this folder to your own repository.

## Storage and compatibility

- Lorebook folder assignments are stored in `extensionSettings.LorebookOrganizer.books`.
- Empty Lorebook folders are stored in `extensionSettings.LorebookOrganizer.bookFolders`.
- Entry folder assignments are stored in `entry.extensions.lorebook_folder`, a portable extension field inside the Lorebook entry.
- Entry folder list metadata is stored in `extensionSettings.LorebookOrganizer.entryFolders`.
- This extension does not intentionally change entry keys, content, activation settings, insertion order, or book bindings.

## Current version limitations

- This is an initial functional build. Test on a copy/backup of your Lorebooks first.
- Entry folder changes are saved through SillyTavern's World Info edit endpoint.
- Drag and drop is supported with a mouse; on touch devices use the move dropdown for Entries. Lorebook move can be done from the card's ⋯ menu.
- Folder rename/delete controls operate on the currently selected folder. The selected folder is shown in the breadcrumb.
- Book rename is not implemented in this first build; use SillyTavern's native World Info editor for renaming books.
- The organizer is additive and does not replace the native World Info editor.

## Troubleshooting

If the button does not appear:
- Confirm the folder is directly inside `third-party`.
- Confirm `manifest.json`, `index.js`, and `style.css` are directly inside `lorebook-organizer`.
- Restart SillyTavern and hard-refresh the browser (`Ctrl+Shift+R`).
- Check the browser console for `[Lorebook Organizer]` messages.
