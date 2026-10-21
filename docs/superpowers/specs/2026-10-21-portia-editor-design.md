# Portia Charter Editor Design

## Approved outcome

Restore the public charter exactly from commit `d5b0d8dc84f3e0fb3cac380a4c8a0f4d088348d1`, then add a private owner editor without replacing, simplifying, or rewording the restored material.

## Source of truth and data safety

- The eight `sections/page*.html` files, `index.html`, `script.js`, `styles.css`, and existing assets from `d5b0d8d` are the canonical baseline.
- The editor is an additive layer. It may serialize edited section HTML to Supabase, but the checked-in baseline remains a working fallback.
- Before a published edit overwrites the current row, keep the previous snapshot in a revisions table.
- A missing, incomplete, or malformed remote document must never erase the checked-in baseline.

## Access model

- Visitors see only the charter. No editor button, markup, or affordance appears for an anonymous session.
- The owner signs in through the dedicated login page.
- Supabase RLS allows public reads and restricts content, revision, and media writes to the owner account.

## Editor interaction

- The owner opens a restrained, task-focused side panel over the existing charter.
- The top bar exposes selection status, undo, redo, save, and close.
- Editing tools are grouped as Text, Styles, Blocks, and Media, using Russian labels and short explanations.
- Normal drag selection edits one range. Ctrl+left-click toggles whole editable blocks into a multi-selection; formatting applies to every selected block.
- Undo/redo works through buttons and `Ctrl+Z` / `Ctrl+Shift+Z`.
- Existing classes are first-class presets: brand turquoise, all highlight colors, rank colors, titles, lists, links, tooltips, qualification lists, and leadership constructs.
- Owners may adjust text color and background color with presets plus a custom hex/native picker. A global-style mode updates every matching class in the charter; a selection mode affects only selected content.
- Blocks can be inserted as heading, paragraph, bullet list, numbered list, notice/highlight, link, image, or video.

## Media

- Images are compressed in the browser, resized to a sensible maximum dimension, encoded as WebP when supported, and uploaded to a public Supabase Storage bucket.
- Image blocks preserve aspect ratio and use the charter's existing framed-content visual language.
- Video accepts either an uploaded file or a URL. YouTube and other known providers are converted to safe embed URLs; unknown URLs remain linked rather than injected as arbitrary iframe HTML.
- Media blocks include caption, alt text for images, width preset, alignment, and remove/replace actions.
- Media is responsive on narrow screens and never overflows the charter page.

## Visual direction

- The charter keeps the exact incumbent Portia visual system from `d5b0d8d`.
- The editor is a quiet utility surface: clear hierarchy, familiar controls, turquoise only for primary/selected states, complete hover/focus/disabled/loading/error states, and no decorative redesign of the charter.

## Success criteria

- The deployed public site visibly matches the `d5b0d8d` content and styles before any remote edits.
- Every existing semantic style is available in the editor.
- The owner can add formatted text, an optimized image, and a YouTube video, then save once and see the result in an anonymous browser.
- Anonymous users cannot discover or invoke editor controls and cannot write through Supabase APIs.
- Tests cover baseline preservation, sanitizer/media URL behavior, history, multi-selection formatting, and owner-only policies.
