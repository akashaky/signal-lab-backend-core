import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";

const client = new SQSClient({ region: "us-east-1" });

const QUEUE_URL = "https://sqs.us-east-1.amazonaws.com/060314909379/dev-shopify-webhook";

export async function sendToQueue(messageBody) {
  const command = new SendMessageCommand({
    QueueUrl: QUEUE_URL,
    MessageBody: JSON.stringify(messageBody),
  });
  return client.send(command);
}
