import { getTogether } from "@/lib/get-together";

export async function POST(request: Request) {
  try {
    const { apiKey } = await request.json();

    if (!apiKey) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "API key is required",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    const together = getTogether(apiKey);

    try {
      // Make a simple chat completion call to validate the API key
      await together.chat.completions.create({
        model: "Qwen/Qwen2.5-72B-Instruct-Turbo",
        messages: [
          {
            role: "user",
            content: "Hello, how are you?",
          },
        ],
        max_tokens: 1, // Minimal tokens for validation
      });

      return new Response(
        JSON.stringify({
          success: true,
          message: "API key is valid",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    } catch (error) {
      console.error("API key validation failed:", error);

      const errorCode =
        typeof error === "object" && error !== null && "code" in error
          ? String((error as { code?: unknown }).code)
          : undefined;

      return new Response(
        JSON.stringify({
          success: false,
          message: "Invalid API key or service unavailable",
          code: errorCode || "VALIDATION_ERROR",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
  } catch (error) {
    console.error("Request processing failed:", error);
    return new Response(
      JSON.stringify({
        success: false,
        message: "Invalid request format",
        code: "INVALID_REQUEST",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }
}
