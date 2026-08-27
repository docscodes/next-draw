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
rectangles drawn over them live in a table. Create that table once by running
[`supabase/migrations/0001_floorplan_annotations.sql`](supabase/migrations/0001_floorplan_annotations.sql)
in the Supabase SQL editor, or with the CLI:

```bash
supabase db push
```

Until it exists the viewer still opens plans, but says marks are not being
saved.
