import { NextResponse } from "next/server";
import { parseWorkbook } from "@/lib/leave/parser";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Upload a valid Excel file." }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    const parsed = parseWorkbook(file.name, buffer);

    return NextResponse.json({ data: parsed });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The workbook could not be parsed. Please verify the monthly file format.",
      },
      { status: 400 },
    );
  }
}
