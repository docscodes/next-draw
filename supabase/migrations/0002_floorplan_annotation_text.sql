-- Text read out of the capture rectangles by the OCR pass, which runs in the
-- browser. Only `capture` rows are ever filled in; `ignore` rows keep nulls.

alter table public.floorplan_annotations
  add column if not exists text text,
  -- Tesseract's mean confidence for the reading, on its own 0-100 scale.
  add column if not exists confidence double precision
    check (confidence >= 0 and confidence <= 100),
  add column if not exists read_at timestamptz;
