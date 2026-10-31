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
Saving visualizer edits refreshes an open panel automatically.
Visibility, position, and width are saved in localStorage under `shimmer.visualizer.visible`,
`shimmer.visualizer.position`, and `shimmer.visualizer.width`
and restored when reopening the app. Height follows the image's aspect ratio.

Choose **Edit** in the floating panel (or **Set up visualizer** before adding a photo).
Upload a house photo, select a non-group
track, and add rectangles. Drag rectangles to move them and their white bottom-right
corners to resize them. The object list and percentage fields also allow selecting
and adjusting rectangles with the keyboard. Clicking a rectangle selects its owner
track; it never reassigns the rectangle to a different track.

Select a rectangle and choose **Duplicate rectangle** to make a copy on the same
track with the same dimensions and color. The copy is offset slightly within the
image and selected so you can move or edit it immediately.

To copy between tracks, select a rectangle, press **Ctrl+C** (or **⌘C**), select the
destination track, and press **Ctrl+V** (or **⌘V**). The pasted rectangle keeps the
copied position, size, and color, belongs only to the destination track, and is
selected automatically. Each paste creates an independent copy. Copy/paste in
editable fields continues to work normally.

You can also paste a copied image or screenshot with **Ctrl+V** (Windows/Linux) or
**⌘V** (Mac) anywhere in the open visualizer. Pasting replaces the draft background
while preserving rectangles, and only saves when you choose **Save and close**.

**Save and close** persists the draft. Cancel, the close button, and Escape discard
unsaved changes. Replacing an image preserves the rectangle layout.

The browser has one shared visualizer setup, reusable across shows with the same
track names. Track IDs are the names displayed in the existing editor. Objects for
tracks absent from the current show are retained but hidden. Group rows cannot own
objects. Visualizer data is local to this browser and is not included in show exports.

Local storage key `shimmer.visualizer` contains exactly:

```json
{
  "Roof": [{ "x": 0.2, "y": 0.3, "width": 0.1, "height": 0.05, "color": "#ff8800" }]
}
```

Coordinates and dimensions are normalized image fractions (0–1), independent of
display size; colors are six-digit hex values. The photo is a Blob in IndexedDB,
database `shimmer-editor`, store `visualizer_images`, key `house`. No image data is
written to local storage. Storage errors leave the dialog open for retry, and a failed
configuration write rolls the image back to its previous value.
