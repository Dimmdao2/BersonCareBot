# API Contract: Online Intake V1

Контракт REST API для online intake (LFK + Nutrition). Версия v1.

## Auth

Все эндпоинты требуют сессию (Next.js session cookie). Роль определяется из сессии.

Roles:
- `patient` — создание заявки, просмотр собственных.
- `doctor` / `admin` — чтение всех заявок, изменение статуса.

## Patient API

### POST /api/patient/online-intake/lfk

Создать LFK intake request.

**Request Body:**
```typescript
{
  description: string;          // required, min 20, max 5000 chars
  attachmentUrls?: string[];    // optional, max 5 items, each valid URL
  attachmentFileIds?: string[]; // optional, max 10 items, uploaded media IDs
}
```

**Response 201:**
```typescript
{
  id: string;          // UUID
  type: "lfk";
  status: "new";
  createdAt: string;   // ISO 8601
}
```

**Errors:**
- `400` — validation failed: `{ error: "VALIDATION_ERROR", details: [...] }`
- `401` — not authenticated
- `429` — rate limit exceeded: max 3 active LFK requests per user

---

### POST /api/patient/online-intake/nutrition

Создать Nutrition intake request.

**Request Body:**
```typescript
{
  answers: Array<{
    questionId: "q1" | "q2" | "q3" | "q4" | "q5";
    value: string;
  }>;
}
```

Required question IDs: `q1`, `q2`, `q4`, `q5`. Optional: `q3`.

**Question schema:**
- `q1`: age (number as string, 1–120)
- `q2`: weight and height (free text, e.g. "75 / 178")
- `q3`: chronic diseases / restrictions (optional text)
- `q4`: goal (`weight_loss` | `weight_gain` | `healthy_eating` | `other`)
- `q5`: current diet description and request to nutritionist (min 10 chars)

**Response 201:**
```typescript
{
  id: string;
  type: "nutrition";
  status: "new";
  createdAt: string;
}
```

**Errors:**
- `400` — missing required answers or invalid q4 value
- `401` — not authenticated
- `429` — rate limit: max 3 active nutrition requests per user

---

### GET /api/patient/online-intake

List patient's own intake requests.

**Query params:** `?type=lfk|nutrition&status=new|in_review|contacted|closed&limit=20&offset=0`

**Response 200:**
```typescript
{
  items: Array<{
    id: string;
    type: "lfk" | "nutrition";
    status: "new" | "in_review" | "contacted" | "closed";
    summary: string;      // first 200 chars of description / first meaningful answer
    createdAt: string;
    updatedAt: string;
  }>;
  total: number;
}
```

---

## Doctor / Admin API

### GET /api/doctor/online-intake

List all intake requests (doctor/admin only).

**Query params:** `?type=lfk|nutrition&status=new|in_review|contacted|closed&page=1&limit=20`

**Response 200:**
```typescript
{
  items: Array<{
    id: string;
    type: "lfk" | "nutrition";
    status: string;
    summary: string;
    patientName: string;
    patientPhone: string;
    createdAt: string;
    updatedAt: string;
  }>;
  total: number;
  page: number;
  totalPages: number;
}
```

---

### GET /api/doctor/online-intake/:id

Get full intake request details.

**Response 200:**
```typescript
{
  id: string;
  type: "lfk" | "nutrition";
  status: string;
  patientName: string;
  patientPhone: string;
  createdAt: string;
  updatedAt: string;
  // LFK specific:
  description?: string;
  attachmentUrls?: string[];
  attachmentFiles?: Array<{
    id: string;
    url: string;           // pre-signed S3 URL, valid 1h
    originalName: string;
    mimeType: string;
    sizeBytes: number;
  }>;
  // Nutrition specific:
  answers?: Array<{
    questionId: string;
    questionText: string;  // human-readable
    value: string;
    ordinal: number;
  }>;
  // Status history:
  statusHistory: Array<{
    fromStatus: string | null;
    toStatus: string;
    changedBy: string;     // user display name
    note: string | null;
    changedAt: string;
  }>;
}
```

**Errors:**
- `404` — request not found
- `403` — not doctor/admin role

---

### PATCH /api/doctor/online-intake/:id/status

Change intake request status.

**Request Body:**
```typescript
{
  status: "in_review" | "contacted" | "closed";
  note?: string;  // optional audit note, max 500 chars
}
```

**Response 200:**
```typescript
{
  id: string;
  status: string;
  updatedAt: string;
}
```

**Status transition rules:**
- `new` → `in_review` | `contacted` | `closed`
- `in_review` → `contacted` | `closed`
- `contacted` → `closed`
- `closed` → (terminal, no transitions)

**Errors:**
- `400` — invalid transition: `{ error: "INVALID_STATUS_TRANSITION" }`
- `403` — not doctor/admin

---

## Rate Limits

| Endpoint | Limit |
|---|---|
| POST /api/patient/online-intake/lfk | 3 active per user |
| POST /api/patient/online-intake/nutrition | 3 active per user |

"Active" = status in (`new`, `in_review`, `contacted`).

## Error format

All errors:
```json
{
  "error": "ERROR_CODE",
  "message": "human-readable description",
  "details": []   // optional, for validation errors
}
```
