# Next.js template

This is a Next.js template with shadcn/ui.

## Adding components

To add components to your app, run the following command:

```bash
npx shadcn@latest add button
```

This will place the ui components in the `components` directory.

## Using components

To use the components in your app, import them as follows:

```tsx
import { Button } from "@/components/ui/button";
```

## Supabase setup

Floorplan PDFs live in a storage bucket (`SUPABASE_FLOORPLANS_BUCKET`), and the
rectangles drawn over them live in a table. Create it once by running the files
in [`supabase/migrations`](supabase/migrations) in the Supabase SQL editor, or
with the CLI:

```bash
supabase db push
```

Until the table exists the viewer still opens plans, but says marks are not
being saved.

## Reading text off a plan

Drawing a green rectangle runs OCR over what it covers and stores the text
alongside the rectangle. Anything a red rectangle covers is painted out first,
so content marked to ignore cannot bleed into the reading. **Read** in the
toolbar reads every green rectangle on the page again, and the panel underneath
lists what came back, with Tesseract's confidence in it.

OCR runs on the machine, in the browser: `scripts/copy-tesseract-assets.mjs`
copies the [tesseract.js](https://github.com/naptha/tesseract.js) engine and
the English model out of `node_modules` and into `public/tesseract`, and `dev`
and `build` both run it first. No page is ever sent anywhere to be read. The
first read of a session loads ~7 MB of WebAssembly and model data and so takes
a few seconds; the browser caches both, and later reads are quick.
