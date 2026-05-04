"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { routePaths } from "@/app-layer/routes/paths";

type QuestionDef = {
  id: "q1" | "q2" | "q3" | "q4" | "q5";
  text: string;
  required: boolean;
  type: "text" | "textarea" | "select";
  options?: { value: string; label: string }[];
  placeholder?: string;
};

const QUESTIONS: QuestionDef[] = [
  {
    id: "q1",
    text: "Ваш возраст?",
    required: true,
    type: "text",
    placeholder: "Например: 32",
  },
  {
    id: "q2",
    text: "Ваш вес (кг) и рост (см)?",
    required: true,
    type: "text",
    placeholder: "Например: 75 / 178",
  },
  {
    id: "q3",
    text: "Есть ли хронические заболевания или ограничения в питании?",
    required: false,
    type: "textarea",
    placeholder: "Если нет — оставьте пустым",
  },
  {
    id: "q4",
    text: "Ваша цель?",
    required: true,
    type: "select",
    options: [
      { value: "weight_loss", label: "Снижение веса" },
      { value: "weight_gain", label: "Набор массы" },
      { value: "healthy_eating", label: "Здоровое питание" },
      { value: "other", label: "Другое" },
    ],
  },
  {
    id: "q5",
    text: "Опишите текущий рацион и ваш запрос к нутрициологу",
    required: true,
    type: "textarea",
    placeholder: "Что вы обычно едите, что хотите изменить, с чем нужна помощь...",
  },
];

type State = "form" | "submitting" | "success" | "error";

export function NutritionIntakeClient() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [state, setState] = useState<State>("form");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const question = QUESTIONS[currentStep];
  const isLastStep = currentStep === QUESTIONS.length - 1;
  const currentValue = answers[question?.id ?? ""] ?? "";

  const isCurrentValid =
    !question?.required || (question?.required && currentValue.trim().length >= 1);

  function handleNext() {
    if (!question) return;
    if (isLastStep) {
      void handleSubmit();
    } else {
      setCurrentStep((s) => s + 1);
    }
  }

  function handleBack() {
    if (currentStep > 0) {
      setCurrentStep((s) => s - 1);
    } else {
      router.back();
    }
  }

  async function handleSubmit() {
    setState("submitting");
    setErrorMessage(null);

    const answersList = QUESTIONS.filter((q) => answers[q.id] !== undefined && answers[q.id]!.trim() !== "").map(
      (q) => ({ questionId: q.id, value: answers[q.id]!.trim() }),
    );

    try {
      const res = await fetch("/api/patient/online-intake/nutrition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: answersList }),
      });

      if (res.ok) {
        setState("success");
      } else {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        setErrorMessage(data.message ?? "Произошла ошибка. Попробуйте ещё раз.");
        setState("error");
      }
    } catch {
      setErrorMessage("Не удалось отправить анкету. Проверьте подключение.");
      setState("error");
    }
  }

  if (state === "success") {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <h2 className="text-base font-semibold text-green-700">Анкета отправлена</h2>
          <p className="text-sm text-muted-foreground">
            Нутрициолог свяжется с вами в ближайшее время.
          </p>
        </div>
        <Button variant="outline" onClick={() => router.push(routePaths.cabinet)}>
          Вернуться в кабинет
        </Button>
      </div>
    );
  }

  if (!question) return null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold">Онлайн-запрос: Нутрициология</h2>
        <Badge variant="outline">
          {currentStep + 1} / {QUESTIONS.length}
        </Badge>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">
          {question.text}
          {question.required && <span className="ml-1 text-destructive">*</span>}
        </p>

        {question.type === "text" && (
          <Input
            type="text"
            placeholder={question.placeholder}
            value={currentValue}
            onChange={(e) => setAnswers((a) => ({ ...a, [question.id]: e.target.value }))}
            disabled={state === "submitting"}
            autoFocus
          />
        )}

        {question.type === "textarea" && (
          <Textarea
            className="min-h-24"
            placeholder={question.placeholder}
            value={currentValue}
            onChange={(e) => setAnswers((a) => ({ ...a, [question.id]: e.target.value }))}
            disabled={state === "submitting"}
          />
        )}

        {question.type === "select" && question.options && (
          <div className="flex flex-col gap-2">
            {question.options.map((opt) => (
              <Button
                key={opt.value}
                type="button"
                variant={currentValue === opt.value ? "default" : "outline"}
                className="justify-start"
                onClick={() => setAnswers((a) => ({ ...a, [question.id]: opt.value }))}
                disabled={state === "submitting"}
              >
                {opt.label}
              </Button>
            ))}
          </div>
        )}
      </div>

      {state === "error" && errorMessage && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorMessage}
        </p>
      )}

      <div className="flex gap-2">
        <Button variant="outline" onClick={handleBack} disabled={state === "submitting"}>
          Назад
        </Button>
        <Button
          onClick={handleNext}
          disabled={!isCurrentValid || state === "submitting"}
        >
          {isLastStep
            ? state === "submitting"
              ? "Отправка..."
              : "Отправить анкету"
            : "Далее"}
        </Button>
      </div>
    </div>
  );
}
