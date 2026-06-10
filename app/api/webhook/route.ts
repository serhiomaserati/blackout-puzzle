import { NextRequest, NextResponse } from "next/server";

/**
 * Farcaster / Base App mini-app webhook.
 *
 * Клиент (Farcaster, Base App) шлёт сюда подписанные события жизненного цикла
 * аппы. Тело — JSON Farcaster Signature: { header, payload, signature },
 * где каждое поле — base64url-кодированный JSON.
 *
 *   header  -> { fid, type, key }
 *   payload -> { event, notificationDetails? }
 *
 * События: "frame_added" | "frame_removed" |
 *          "notifications_enabled" | "notifications_disabled".
 *
 * Чтобы РЕАЛЬНО слать push-уведомления позже, нужно сохранять
 * notificationDetails.{url,token} в персистентном KV-сторе (Upstash Redis и т.п.),
 * привязав к payload header.fid. Сейчас стор не подключён — событие просто
 * валидируется и подтверждается (200), чтобы манифест был корректным для листинга.
 */

type WebhookEvent =
  | "frame_added"
  | "frame_removed"
  | "notifications_enabled"
  | "notifications_disabled";

interface WebhookPayload {
  event: WebhookEvent;
  notificationDetails?: { url: string; token: string };
}

function decodeBase64UrlJson<T>(value: string): T {
  // base64url -> base64
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const json = Buffer.from(base64, "base64").toString("utf8");
  return JSON.parse(json) as T;
}

export async function POST(request: NextRequest) {
  let body: { header?: string; payload?: string; signature?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  if (!body?.header || !body?.payload || !body?.signature) {
    return NextResponse.json(
      { message: "Missing header/payload/signature" },
      { status: 400 },
    );
  }

  let header: { fid: number; type: string; key: string };
  let payload: WebhookPayload;
  try {
    header = decodeBase64UrlJson(body.header);
    payload = decodeBase64UrlJson(body.payload);
  } catch {
    return NextResponse.json({ message: "Malformed event" }, { status: 400 });
  }

  // Здесь подключается персистентность токенов уведомлений:
  switch (payload.event) {
    case "frame_added":
    case "notifications_enabled":
      // TODO: сохранить payload.notificationDetails по header.fid в KV-стор.
      console.log(`[webhook] ${payload.event} fid=${header.fid}`);
      break;
    case "frame_removed":
    case "notifications_disabled":
      // TODO: удалить сохранённый токен по header.fid.
      console.log(`[webhook] ${payload.event} fid=${header.fid}`);
      break;
    default:
      console.log(`[webhook] unknown event fid=${header.fid}`);
  }

  return NextResponse.json({ success: true });
}
