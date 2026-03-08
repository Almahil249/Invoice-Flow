export interface Invoice {
  invoice_id: string;
  user_name: string;
  team: string;
  submission_date: string;
  store_name: string;
  invoice_number: string;
  tax_registration_number: string;
  invoice_date: string;
  amount_before_tax: number;
  amount_after_tax: number;
  vat_amount: number;
  currency: string;
  category: string;
  items_summary: string;
  entry_method: string;
  manual_entry_reason: string;
  requires_review: boolean;
  ocr_confidence: number | null;
  original_image_url: string;
  highlighted_image_url: string;
  processing_status: string;
  status: "pending" | "approved" | "flagged" | "rejected";
  notes: string;
  image_link: string;
}

import { categories } from "./categories";

export { categories };
