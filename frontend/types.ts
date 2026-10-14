export interface Field {
  name: string;
  key: string;
  label: string;
  type: string;
  hidden: boolean;
  value: string | boolean;
  required: boolean;
  help: string;
  errors: string[];
  choices: { value: string; label: string }[];
  min?: string | null;
  max?: string | null;
}
export interface FormSpec {
  fields: Field[];
  errors: string[];
}
// Django owns these screen-specific records; money, quantities and IDs are decimal strings.
export type Row = Record<string, any>;
export interface Page {
  screen: string;
  url: string;
  data: Row;
  role: "SALES" | "WAREHOUSE" | "MANAGER" | null;
  user: { id: string; name: string } | null;
  csrf: string;
  demo: boolean;
  today: string;
  messages: { text: string; type: string }[];
}
