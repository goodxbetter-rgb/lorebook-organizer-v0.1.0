# Lorebook Organizer

SillyTavern UI extension for organizing World Info Lorebooks and their entries into folders with a maximum depth of two levels.

## Features

- Organize Lorebooks into folders and one nested subfolder level.
- Organize entries inside each Lorebook in the same way.
- Create, rename, and delete folders.
- Move Lorebooks and entries by drag-and-drop or the entry folder selector.
- Search Lorebooks and entries.
- Lorebook folder assignments are stored in extension settings.
- Entry folder assignments are stored in each entry's `extensions.lorebook_folder` field.
- Uses SillyTavern's `getContext().saveWorldInfo()` API to save entry changes.

Folders only organize the library display; they do not change World Info activation or insertion behavior.

## Install

In SillyTavern, open **Extensions → Install Extension** and enter the Git repository URL containing these files at its root. Alternatively, copy this folder into `data/<user>/extensions/Lorebook-Organizer/` and restart or reload SillyTavern.

## Use

Open **Extensions → Lorebook Organizer → Open Organizer**. Select the Lorebooks or Entries tab, create folders, and move items into them. Folder nesting is limited to two levels.
