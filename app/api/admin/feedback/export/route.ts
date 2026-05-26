import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requireAdmin } from "@/lib/adminGuard";
import { supabaseServer } from "@/lib/supabase-server";

export const runtime = "nodejs";

type FeedbackQuestionRow = {
  id: string;
  prompt: string;
  question_type: string;
  sort_order: number;
};

type FeedbackResponseRow = {
  id: string;
  respondent_name: string | null;
  respondent_email: string | null;
  is_anonymous: boolean;
  status: string;
  created_at: string;
};

type FeedbackAnswerRow = {
  response_id: string;
  question_id: string | null;
  question_prompt: string;
  answer_text: string | null;
};

function safeSheetName(value: string) {
  return value.replace(/[\\/*?:[\]]/g, " ").slice(0, 31) || "Feedback";
}

function styleHeader(sheet: ExcelJS.Worksheet) {
  const header = sheet.getRow(1);
  header.font = { bold: true };
  header.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFDFF5E1" },
  };
}

export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) {
    const status = guard.reason === "not_logged_in" ? 401 : 403;
    const error = guard.reason === "not_logged_in" ? "Unauthorized" : "Forbidden";
    return NextResponse.json({ error }, { status });
  }

  const url = new URL(req.url);
  const formId = url.searchParams.get("form_id");
  if (!formId) {
    return NextResponse.json({ error: "Missing form id." }, { status: 400 });
  }

  const db = supabaseServer();
  const { data: form, error: formError } = await db
    .from("feedback_forms")
    .select("id,title")
    .eq("id", formId)
    .maybeSingle();

  if (formError || !form) {
    return NextResponse.json({ error: "Feedback form not found." }, { status: 404 });
  }

  const { data: questionData, error: questionError } = await db
    .from("feedback_questions")
    .select("id,prompt,question_type,sort_order")
    .eq("form_id", formId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (questionError) {
    return NextResponse.json({ error: questionError.message }, { status: 500 });
  }

  const { data: responseData, error: responseError } = await db
    .from("feedback_responses")
    .select("id,respondent_name,respondent_email,is_anonymous,status,created_at")
    .eq("form_id", formId)
    .order("created_at", { ascending: false });

  if (responseError) {
    return NextResponse.json({ error: responseError.message }, { status: 500 });
  }

  const responses = (responseData ?? []) as FeedbackResponseRow[];
  const responseIds = responses.map((response) => response.id);
  const { data: answerData, error: answerError } =
    responseIds.length > 0
      ? await db
          .from("feedback_answers")
          .select("response_id,question_id,question_prompt,answer_text")
          .in("response_id", responseIds)
      : { data: [], error: null };

  if (answerError) {
    return NextResponse.json({ error: answerError.message }, { status: 500 });
  }

  const questions = (questionData ?? []) as FeedbackQuestionRow[];
  const answers = (answerData ?? []) as FeedbackAnswerRow[];
  const answersByResponse = new Map<string, FeedbackAnswerRow[]>();
  for (const answer of answers) {
    const list = answersByResponse.get(answer.response_id) ?? [];
    list.push(answer);
    answersByResponse.set(answer.response_id, list);
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "EUBC Badminton";
  workbook.created = new Date();

  const responseSheet = workbook.addWorksheet(safeSheetName("Responses"));
  responseSheet.columns = [
    { header: "Submitted", key: "submitted", width: 22 },
    { header: "Status", key: "status", width: 12 },
    { header: "Anonymous", key: "anonymous", width: 12 },
    { header: "Name", key: "name", width: 22 },
    { header: "Email", key: "email", width: 30 },
    ...questions.map((question, index) => ({
      header: question.prompt,
      key: `q_${index}`,
      width: 34,
    })),
  ];

  for (const response of responses) {
    const answerMap = new Map(
      (answersByResponse.get(response.id) ?? []).map((answer) => [
        answer.question_id ?? answer.question_prompt,
        answer.answer_text ?? "",
      ])
    );
    responseSheet.addRow({
      submitted: new Date(response.created_at).toLocaleString("en-GB"),
      status: response.status,
      anonymous: response.is_anonymous ? "Yes" : "No",
      name: response.respondent_name ?? "",
      email: response.respondent_email ?? "",
      ...Object.fromEntries(
        questions.map((question, index) => [
          `q_${index}`,
          answerMap.get(question.id) ?? answerMap.get(question.prompt) ?? "",
        ])
      ),
    });
  }

  const groupedSheet = workbook.addWorksheet(safeSheetName("Grouped answers"));
  groupedSheet.columns = [
    { header: "Question", key: "question", width: 42 },
    { header: "Answer", key: "answer", width: 42 },
    { header: "Count", key: "count", width: 12 },
  ];

  for (const question of questions) {
    const counts = new Map<string, number>();
    for (const answer of answers.filter((item) => item.question_id === question.id)) {
      const value = answer.answer_text || "(blank)";
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    for (const [answer, count] of counts.entries()) {
      groupedSheet.addRow({ question: question.prompt, answer, count });
    }
  }

  for (const sheet of [responseSheet, groupedSheet]) {
    styleHeader(sheet);
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: sheet.columnCount },
    };
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `feedback-${new Date().toISOString().slice(0, 10)}.xlsx`;

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
