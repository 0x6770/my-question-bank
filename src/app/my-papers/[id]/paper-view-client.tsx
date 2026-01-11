"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { WatermarkedImage } from "@/components/watermarked-image";

type Question = {
  id: number;
  marks: number;
  difficulty: number;
  calculator: boolean;
  createdAt: string;
  images: {
    id: number;
    storage_path: string;
    position: number;
    signedUrl: string | null;
  }[];
  answerImages: {
    id: number;
    storage_path: string;
    position: number;
    signedUrl: string | null;
  }[];
};

type Paper = {
  id: number;
  title: string;
  question_bank: string;
  show_answers: boolean;
  created_at: string;
  updated_at: string;
  questions: Question[];
};

type PaperViewClientProps = {
  paper: Paper;
};

export function PaperViewClient({ paper }: PaperViewClientProps) {
  const router = useRouter();
  const printRef = useRef<HTMLDivElement>(null);
  const [isPreparingPrint, setIsPreparingPrint] = useState(false);
  const [printNotice, setPrintNotice] = useState<string | null>(null);

  const waitForImages = async () => {
    const container = printRef.current;
    if (!container) return true;

    // Check for canvas elements (WatermarkedImage uses canvas)
    const canvases = Array.from(container.querySelectorAll("canvas"));

    if (canvases.length === 0) return true;

    // Wait for canvases to have content (width > 0 means image was drawn)
    const maxWaitTime = 10000; // 10 seconds max
    const checkInterval = 100;
    let elapsed = 0;

    while (elapsed < maxWaitTime) {
      const allReady = canvases.every(
        (canvas) => canvas.width > 0 && canvas.height > 0,
      );
      if (allReady) return true;
      await new Promise((resolve) => setTimeout(resolve, checkInterval));
      elapsed += checkInterval;
    }

    return false;
  };

  const handlePrint = async () => {
    if (isPreparingPrint) return;
    setIsPreparingPrint(true);
    setPrintNotice(null);
    const imagesReady = await waitForImages();
    if (!imagesReady) {
      setPrintNotice(
        "Some images failed to load. If the PDF is blank, refresh and try again.",
      );
    }
    await new Promise((resolve) => requestAnimationFrame(resolve));
    window.print();
    setIsPreparingPrint(false);
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this paper?")) {
      return;
    }

    try {
      const response = await fetch(`/api/papers/${paper.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete paper");
      }

      router.push("/my-papers");
    } catch (error) {
      alert("Failed to delete paper. Please try again.");
      console.error(error);
    }
  };

  return (
    <div>
      {/* Action Bar - Hidden when printing */}
      <div className="bg-white shadow-sm border-b print:hidden">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <button
                type="button"
                onClick={() => router.back()}
                className="text-blue-600 hover:text-blue-800"
              >
                ← Back
              </button>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleDelete}
                className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-md transition-colors"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={handlePrint}
                disabled={isPreparingPrint}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-300 transition-colors"
              >
                {isPreparingPrint ? "Preparing PDF..." : "Print / Save as PDF"}
              </button>
            </div>
          </div>
          {printNotice ? (
            <p className="mt-2 text-xs text-amber-600">{printNotice}</p>
          ) : null}
        </div>
      </div>

      {/* Paper Content - Printable */}
      <div ref={printRef} className="container mx-auto px-6 py-8 max-w-4xl">
        {/* Cover Page */}
        <div className="cover-page flex min-h-[60vh] flex-col justify-center">
          <div className="mb-8 pb-6 border-b-2 border-gray-300">
            <h1 className="text-3xl font-bold mb-2">{paper.title}</h1>
            <div className="text-sm text-gray-600 space-y-1">
              <p>Total Questions: {paper.questions.length}</p>
              <p>
                Total Marks:{" "}
                {paper.questions.reduce((sum, q) => sum + q.marks, 0)}
              </p>
              <p>
                Created:{" "}
                {new Date(paper.created_at).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>
            </div>
          </div>
        </div>

        {/* Questions Section */}
        <div className="space-y-8">
          {paper.questions.map((question, index) => (
            <div key={question.id} className="page-break-inside-avoid">
              {/* Question Header */}
              <div className="mb-4">
                <div className="flex items-baseline justify-between mb-2">
                  <h2 className="text-lg font-semibold">
                    Question {index + 1}
                  </h2>
                  <span className="text-sm text-gray-600">
                    [{question.marks} mark{question.marks !== 1 ? "s" : ""}]
                  </span>
                </div>
                <div className="text-xs text-gray-500 print:hidden">
                  Difficulty: {question.difficulty} |{" "}
                  {question.calculator ? "Calculator" : "No Calculator"}
                </div>
              </div>

              {/* Question Images */}
              {question.images.length > 0 && (
                <div className="space-y-3 mb-6">
                  {question.images.map((image) => (
                    <div key={image.id}>
                      {image.signedUrl && (
                        <WatermarkedImage
                          src={image.signedUrl}
                          alt={`Question ${index + 1} part ${image.position}`}
                          className="max-w-full h-auto border border-gray-200 rounded"
                          watermarkSrc="/logo.jpg"
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Answer Section (if show_answers is true) */}
              {paper.show_answers && question.answerImages.length > 0 && (
                <div className="mt-6 pt-6 border-t border-gray-200">
                  <h3 className="text-md font-semibold mb-3 text-green-700">
                    Answer:
                  </h3>
                  <div className="space-y-3">
                    {question.answerImages.map((image) => (
                      <div key={image.id}>
                        {image.signedUrl && (
                          <WatermarkedImage
                            src={image.signedUrl}
                            alt={`Answer ${index + 1} part ${image.position}`}
                            className="max-w-full h-auto border border-gray-200 rounded"
                            watermarkSrc="/logo.jpg"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-12 pt-6 border-t border-gray-200 text-center text-sm text-gray-500">
          <p>End of Paper</p>
        </div>
      </div>

      {/* Print Styles */}
      <style jsx global>{`
        @media print {
          body {
            margin: 0;
            padding: 0;
          }

          .cover-page {
            min-height: auto;
            page-break-after: always;
            break-after: page;
          }

          .page-break-inside-avoid {
            page-break-inside: avoid;
            break-inside: avoid;
          }

          @page {
            margin: 2cm;
          }
        }
      `}</style>
    </div>
  );
}
