export type FeedbackQuestionType =
  | "short_text"
  | "long_text"
  | "single_choice"
  | "multi_choice"
  | "rating"
  | "yes_no";

export const QUESTION_TYPES: {
  value: FeedbackQuestionType;
  label: string;
  hint: string;
}[] = [
  {
    value: "short_text",
    label: "Short text",
    hint: "One-line answer, such as a name, location, or short comment.",
  },
  {
    value: "long_text",
    label: "Long text",
    hint: "Larger written answer for bug reports or suggestions.",
  },
  {
    value: "single_choice",
    label: "Single choice",
    hint: "User picks exactly one option from your list.",
  },
  {
    value: "multi_choice",
    label: "Multiple choice",
    hint: "User can tick more than one option from your list.",
  },
  {
    value: "rating",
    label: "Rating 1-5",
    hint: "A five-point score.",
  },
  {
    value: "yes_no",
    label: "Yes / No",
    hint: "Simple two-option answer.",
  },
];
