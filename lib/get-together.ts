import Together from "together-ai";

export function getTogether(userAPIKey: string | null) {
  const options: ConstructorParameters<typeof Together>[0] = {};

  if (userAPIKey) {
    options.apiKey = userAPIKey;
  }

  const together = new Together(options);

  return together;
}
