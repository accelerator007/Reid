#!/usr/bin/env python3
"""Deterministic, prompt-free quality gate shared by the ai-lap runner and QA."""
from __future__ import annotations

import re

VERSION = "reid-quality-v1"
ARABIC = re.compile(r"[\u0600-\u06ff]")
LETTERS = re.compile(r"[^\W\d_]", re.UNICODE)
COMPANY_QUESTION = re.compile(r"مشروع|مشاريع|مهمة|مهام|فاتور|فواتير|عرض سعر|عميل|صفقة|ميزانية|تحصيل|موظف|طلبات|project|task|invoice|quote|client|deal|budget|collection|employee|application", re.I)
COMPLETED_ACTION = re.compile(r"تم\s+(?:إرسال|نشر|حذف|تحديث|إنشاء|دفع|تحويل|اعتماد)|قمت\s+ب(?:إرسال|نشر|حذف|تحديث|إنشاء|دفع|تحويل)|I(?:'ve| have)?\s+(?:sent|published|deleted|updated|created|paid|transferred|approved)\b", re.I)
UNCERTAINTY = re.compile(r"لا توجد بيانات|لا تتوفر(?: لدي)? بيانات|لا أملك بيانات|غير متوفر(?:ة)?|لا يكفي|أحتاج|بحاجة|لا يمكن تأكيد|حسب البيانات المتاحة|no (?:data|evidence)|not available|insufficient|cannot confirm|need more", re.I)
PROMPT_LEAK = re.compile(r"AUTHORIZED COMPANY CONTEXT|REID_GROUNDED_REQUEST|<authorized_company_context>|system prompt|response_contract", re.I)
CITATION = re.compile(r"\[Reid:[a-zA-Z_]+:[0-9a-f-]{8,}\]")
ANY_CITATION = re.compile(r"\[Reid:[^\]]+\]")


def language(text: str) -> str:
    letters = LETTERS.findall(text)
    arabic = ARABIC.findall(text)
    return "ar" if letters and len(arabic) / len(letters) >= 0.2 else "en"


def subject(prompt: str) -> tuple[str, bool | None]:
    match = re.search(r"<user_request>\s*([\s\S]*?)\s*</user_request>", prompt)
    flag = re.search(r"company_context_has_records=(true|false)", prompt)
    return (match.group(1).strip() if match else prompt, flag.group(1) == "true" if flag else None)


def assess(prompt: str, output: str) -> dict:
    request, has_records = subject(prompt)
    answer = output.strip()
    if not answer:
        return {"score": 0, "passed": False, "flags": ["empty_output"], "version": VERSION}
    score, flags = 100, []

    def deduct(flag: str, points: int) -> None:
        nonlocal score
        flags.append(flag)
        score -= points

    if len(answer) < 45:
        deduct("too_short", 20)
    if len(answer) > 12000:
        deduct("too_long", 10)
    if PROMPT_LEAK.search(answer):
        deduct("prompt_leak", 60)
    if COMPLETED_ACTION.search(answer):
        deduct("unsupported_action_claim", 35)
    citations = ANY_CITATION.findall(answer)
    if any(not CITATION.fullmatch(citation) for citation in citations):
        deduct("invalid_company_citation", 25)
    answer_letters, answer_arabic = LETTERS.findall(answer), ARABIC.findall(answer)
    if language(request) == "ar" and len(answer_letters) > 20 and len(answer_arabic) / len(answer_letters) < 0.2:
        deduct("language_mismatch", 20)
    if language(request) == "en" and len(answer_letters) > 20 and len(answer_arabic) / len(answer_letters) > 0.65:
        deduct("language_mismatch", 20)
    if COMPANY_QUESTION.search(request):
        if has_records and not any(CITATION.fullmatch(citation) for citation in citations):
            deduct("missing_company_citation", 20)
        if has_records is False and not UNCERTAINTY.search(answer):
            deduct("uncalibrated_without_evidence", 25)
    score = max(0, min(100, score))
    blocking = {"prompt_leak", "unsupported_action_claim", "invalid_company_citation", "language_mismatch", "missing_company_citation", "uncalibrated_without_evidence"}
    return {"score": score, "passed": score >= 70 and not any(flag in blocking for flag in flags), "flags": flags, "version": VERSION}


def revision_instruction(result: dict, answer_language: str) -> str:
    issues = ", ".join(result.get("flags") or ["clarity"])
    if answer_language == "ar":
        return f"راجع إجابتك قبل الإرسال. أصلح هذه المشاكل: {issues}. أعد الإجابة فقط، بالعربية، مع التزام عقد الرد والمراجع الداخلية الصحيحة."
    return f"Revise your answer before sending it. Fix these issues: {issues}. Return only the improved English answer, following the response contract and using valid internal citations."
