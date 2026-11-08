# Visualizer

**Show visualizer** opens a floating playback panel with Edit and close controls
overlaid on the picture's top-right corner. Drag the picture to move it; drag either invisible bottom corner handle to resize
it while preserving the house image's aspect
ratio. You can also focus a resize handle and use the arrow keys. The panel stays
within the viewport as it resizes.
Use **Hide visualizer** or its close button to dismiss it. The saved house image
stays visible while rectangles appear only for tracks that are on at the timeline's
current time, including when seeking or paused. Beat objects use the same brief
flash as the track tree. Opening or closing the panel does not affect playback.
Saving layout edits refreshes an open panel automatically.
Visibility, position, and width are saved in localStorage under `shimmer.visualizer.visible`,
`shimmer.visualizer.position`, and `shimmer.visualizer.width`
and restored when reopening the app. Height follows the image's aspect ratio.

Choose **Layout / Edit layout**, or **Edit** in the floating panel, to open the
combined layout editor. Playback pauses while opening it. The editable tree is on
the left; the background and light objects are on the right.

Drag tree handles to reorder tracks and groups. Select a track using its icon or
name field, then choose **Add object**. Select an object on the image and drag it
to move it; drag its white bottom-right handle to resize it. Use the color picker
to change its color and the trash button or Delete/Backspace to remove it.
Clicking an object selects its owning track. Objects are also focusable with Tab.

Copy a selected object with **Ctrl+C** (or **Cmd+C**), select a destination track,
and paste with **Ctrl+V** (or **Cmd+V**). Each paste creates an independent copy.
Text editing keeps its normal copy/paste and deletion behavior.

Use **Add image** or **Change image** to upload a background. Pasting an image
outside a text field also replaces the draft background while preserving objects.
**Save** commits tree and visuals together. **Cancel**, the close button, and
Escape discard both. Layouts can be saved without a background image.

Uploaded and pasted backgrounds are resized to at most approximately one megapixel,
preserving aspect ratio without enlarging smaller images, and encoded as WebP at
quality 0.65. The compressed image is previewed and saved; existing backgrounds
are not recompressed on load or save.

The browser has one shared layout document, reusable across shows with the same
track names. Track IDs are the names displayed in the editor. Objects for tracks
absent from the current show are retained but hidden. Group rows cannot own objects.

**Layout / Import layout** and **Export layout** read and write the whole document:

```json
{
  "updatedAt": "2026-11-08T12:00:00.000Z",
  "tree": [{ "type": "track", "id": "Roof" }],
  "visuals": {
    "backgroundImage": "data:image/png;base64,...",
    "trackObjects": {
      "Roof": [{ "x": 0.2, "y": 0.3, "width": 0.1, "height": 0.05, "color": "#ff8800" }]
    }
  }
}
```

The background image is optional and embedded in the JSON so the file is portable.
Saving editor changes sets `updatedAt` using `new Date().toISOString()`.
Importing, loading, and exporting preserve that timestamp. Invalid or missing
timestamps are left undefined.
Coordinates and dimensions are normalized image fractions (0-1); colors are
six-digit hex values. The editor saves one combined document. Renaming a
track in the tree carries its object mapping to the new name; removing a track
removes its objects. Add a track to the layout before assigning objects to it.
Layout edits do not rename show tracks or enter the show's undo history.

The complete document is stored in IndexedDB, database `shimmer-editor`, store
`layouts`, key `current`. If no document is saved, the default layout is used.
Failed saves preserve the active layout and keep the
editor draft open for retry.

Layout documents are separate from show exports. Collapsed groups and floating
panel visibility, position, and width remain browser preferences in localStorage.
