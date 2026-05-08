# Housecall Pro Public API Reference

Base URL: `https://api.housecallpro.com`

## Authentication

Two methods are supported.

API Key (Company or Application):

```http
Authorization: Token {api-key}
```

OAuth 2.0 (Integration Partners only):

```http
Authorization: Bearer {access_token}
```

### OAuth 2.0 Flow (Partners Only)

- Authorization URL: `https://pro.housecallpro.com/oauth/authorize`
- Token URL: `https://api.housecallpro.com/oauth/token`

Step 1 - Redirect user:

```http
GET https://pro.housecallpro.com/oauth/authorize?response_type=code&client_id=CLIENT_ID&redirect_uri=CALLBACK_URL&scope=REQUESTED_SCOPES
```

Step 2 - Exchange code for token:

```http
POST https://api.housecallpro.com/oauth/token
```

```json
{ "client_id": "", "client_secret": "", "grant_type": "authorization_code", "code": "", "redirect_uri": "" }
```

Response:

```json
{ "access_token": "", "token_type": "Bearer", "expires_in": 0, "refresh_token": "", "scope": "", "created_at": 0 }
```

Step 3 - Refresh token:

```http
POST https://api.housecallpro.com/oauth/token
```

```json
{ "client_id": "", "client_secret": "", "grant_type": "refresh_token", "refresh_token": "", "redirect_uri": "" }
```

## Multi-Location Header

For multi-location companies, pass an `X-Company-Id` header to target a specific location. When set, `location_ids` query parameters are ignored.

## Checklists

### GET /checklists

Get a list of checklists belonging to a job or estimate.

Query params:

- `estimate_uuids` array[string] - required if no `job_uuids`
- `job_uuids` array[string] - required if no `estimate_uuids`
- `page` number, default `1`
- `per_page` number, default `10`

Response 200:

```json
{
  "checklists": [
    {
      "id": "string",
      "title": "string",
      "job_uuid": "string",
      "estimate_uuid": "string",
      "sections": [
        {
          "title": "string",
          "order_index": 0,
          "items": [
            { "type": "", "title": "", "required": false, "comment": "", "order_index": 0, "value": "" }
          ]
        }
      ]
    }
  ]
}
```

## Customers

### GET /customers

Get a paginated list of customers.

Query params:

- `expand` array - `attachments`, `do_not_service`
- `location_ids` array[string]
- `page`, default `1`
- `page_size`, default `10`
- `q` string - search by name, email, mobile, address
- `sort_by`, default `created_at`
- `sort_direction` - `asc` or `desc`, default `desc`

Response 200:

```json
{ "page": 1, "page_size": 10, "total_pages": 1, "total_items": 0, "customers": [] }
```

Customer object:

```json
{
  "id": "",
  "first_name": "",
  "last_name": "",
  "email": "",
  "mobile_number": "",
  "home_number": "",
  "work_number": "",
  "company": "",
  "notifications_enabled": true,
  "lead_source": "",
  "notes": "",
  "created_at": "",
  "updated_at": "",
  "company_name": "",
  "company_id": "",
  "tags": [],
  "addresses": [],
  "attachments": [],
  "do_not_service": {}
}
```

### POST /customers

Create a new customer. At least one of `first_name`, `last_name`, `email`, `mobile_number`, `home_number`, or `work_number` is required.

Body:

```json
{
  "first_name": "",
  "last_name": "",
  "email": "",
  "company": "",
  "notifications_enabled": true,
  "mobile_number": "",
  "home_number": "",
  "work_number": "",
  "tags": [],
  "lead_source": "",
  "notes": "",
  "addresses": [
    { "street": "", "street_line_2": "", "city": "", "state": "", "zip": "", "country": "" }
  ]
}
```

Response 201: full Customer object.

### GET /customers/{customer_id}

Get a single customer by ID.

Path: `customer_id` required.

Query: `expand` - `attachments`, `do_not_service`.

Response 200: full Customer object.

### PUT /customers/{customer_id}

Update customer attributes.

Path: `customer_id` required.

Body: same fields as Create Customer, all optional.

Response 200: full Customer object.

### GET /customers/{customer_id}/addresses

Get all addresses for a customer.

Query params: `page`, `page_size`, `sort_by` (`created_at` or `updated_at`), `sort_direction`.

Response 200:

```json
{ "page": 1, "page_size": 10, "total_pages": 1, "total_items": 0, "addresses": [] }
```

Address object:

```json
{ "id": "", "type": "billing", "street": "", "street_line_2": "", "city": "", "state": "", "zip": "", "country": "" }
```

### POST /customers/{customer_id}/addresses

Create an address on a customer.

Body:

```json
{ "street": "", "street_line_2": "", "city": "", "state": "", "zip": "", "country": "", "latitude": 0, "longitude": 0 }
```

Required: `street`, `city`, `state`, `zip`, `country`.

Response 200: Address object.

### GET /customers/{customer_id}/addresses/{address_id}

Get a specific customer address.

Response 200: Address object or null.

## Employees

### GET /employees

Get all active employees in an organization.

Query params: `location_ids`, `page`, `page_size`, `sort_by`, `sort_direction`.

Response 200:

```json
{
  "page": 1,
  "page_size": 10,
  "total_pages": 1,
  "total_items": 0,
  "employees": [
    {
      "id": "",
      "first_name": "",
      "last_name": "",
      "email": "",
      "mobile_number": "",
      "color_hex": "",
      "avatar_url": "",
      "role": "",
      "created_at": "",
      "tags": [],
      "permissions": {
        "can_add_and_edit_job": false,
        "can_be_booked_online": false,
        "can_call_and_text_with_customers": false,
        "can_chat_with_customers": false,
        "can_delete_and_cancel_job": false,
        "can_edit_message_on_invoice": false,
        "can_see_street_view_data": false,
        "can_share_job": false,
        "can_take_payment_see_prices": false,
        "can_see_customers": false,
        "can_see_full_schedule": false,
        "can_see_future_jobs": false,
        "can_see_marketing_campaigns": false,
        "can_see_reporting": false,
        "can_edit_settings": false,
        "is_point_of_contact": false,
        "is_admin": false
      },
      "company_name": "",
      "company_id": ""
    }
  ]
}

```

## Estimates

### GET /estimates

Get a paginated list of estimates.

Query params:

- `customer_id`
- `employee_ids` array
- `expand` - `attachments`
- `location_ids`
- `page`, default `1`
- `page_size`, default `10`
- `scheduled_end_max`
- `scheduled_end_min`
- `scheduled_start_max`
- `scheduled_start_min`
- `sort_by` - `created_at`, `updated_at`, `id`
- `sort_direction` - `asc`, `desc`
- `work_status` array - `unscheduled`, `scheduled`, `in_progress`, `completed`, `canceled`

Response 200: `{ page, page_size, total_pages, total_items, estimates: [Estimate] }`.

Estimate object:

```json
{
  "id": "",
  "estimate_number": "",
  "work_status": "",
  "lead_source": "",
  "customer": {},
  "address": {},
  "created_at": "",
  "updated_at": "",
  "company_name": "",
  "company_id": "",
  "work_timestamps": {},
  "schedule": {},
  "assigned_employees": [],
  "estimate_fields": { "job_type_id": "", "business_unit_id": "" },
  "options": []
}
```

Estimate option:

```json
{
  "id": "",
  "name": "",
  "option_number": "",
  "total_amount": 0,
  "approval_status": "",
  "message_from_pro": "",
  "tags": [],
  "status": "",
  "notes": [],
  "created_at": "",
  "updated_at": "",
  "attachments": []
}
```

### POST /estimates

Create an estimate.

Body:

```json
{
  "estimate_number": "",
  "note": "",
  "message": "",
  "customer_id": "",
  "assigned_employee_ids": [],
  "address_id": "",
  "lead_source": "",
  "address": { "street": "", "street_line_2": "", "city": "", "state": "", "zip": "" },
  "options": [
    { "name": "", "tags": [], "line_items": [] }
  ],
  "tax": { "taxable": true, "tax_rate": 0, "tax_name": "" },
  "schedule": {
    "start_time": "",
    "end_time": "",
    "arrival_window_in_minutes": 0,
    "notify_customer": false
  },
  "estimate_fields": { "job_type_id": "", "business_unit_id": "" }
}
```

Response 200: full Estimate object.

### GET /estimates/{estimate_id}

Get a single estimate by ID.

Query: `expand` - `attachments`.

Response 200: full Estimate object.

### POST /estimates/{estimate_id}/options

Create a new option on an existing estimate.

Body:

```json
{
  "name": "",
  "line_items": [
    { "name": "", "description": "", "unit_price": 0, "unit_cost": 0, "quantity": 1, "taxable": true }
  ],
  "tax": { "taxable": true, "tax_rate": 0, "tax_name": "" }
}
```

Required: `name`.

Response 201: Estimate Option object.

### POST /estimates/{estimate_id}/options/{option_id}/attachment

Create an attachment on an estimate option.

### GET /estimates/{estimate_id}/options/{option_id}/line_items

List estimate option line items.

Response 200: `{ page, page_size, total_pages, total_items, line_items: [LineItem] }`.

### PUT /estimates/{estimate_id}/options/{option_id}/line_items/bulk_update

Bulk update line items for an estimate option. Items without `id` are created as new.

Body:

```json
{ "line_items": [{ "id": "", "service_item_id": "", "service_item_type": "", "name": "", "unit_price": 0, "unit_cost": 0, "quantity": 1, "kind": "", "taxable": true, "description": "" }] }
```

### PUT /estimates/{estimate_id}/options/{option_id}/schedule

Update an estimate option schedule.

Body:

```json
{ "start_time": "", "end_time": "", "arrival_window_in_minutes": 0, "notify": false, "notify_pro": false, "expand": [], "dispatched_employees": [{ "employee_id": "" }] }
```

Required: `start_time` ISO 8601.

### POST /estimates/{estimate_id}/options/{option_id}/notes

Create an estimate option note.

Body: `{ "content": "" }`.

Response 201: `{ "id": "", "content": "" }`.

### DELETE /estimates/{estimate_id}/options/{option_id}/notes/{note_id}

Delete an estimate option note. Response 200.

### POST /estimates/options/decline

Update estimate option approval status to "Pro declined".

Body: `{ "option_ids": [] }`.

Response 200: `{ "status": "", "last_updated_at": "" }`.

### POST /estimates/options/approve

Update estimate option approval status to "Pro approved". May auto-copy to a job based on company settings.

Body: `{ "option_ids": [] }`.

Response 200: `{ "status": "", "last_updated_at": "", "copied_on_approval_to_job_id": "" }`.

## Jobs

### GET /jobs

Get a paginated list of jobs.

Query params:

- `customer_id`
- `employee_ids`
- `expand` - `attachments`, `appointments`
- `location_ids`
- `page`, default `1`
- `page_size`, default `10`
- `scheduled_end_max`
- `scheduled_end_min`
- `scheduled_start_max`
- `scheduled_start_min`
- `sort_by` - `created_at`, `updated_at`, `invoice_number`, `id`, `description`, `work_status`
- `sort_direction`
- `work_status` array - `unscheduled`, `scheduled`, `in_progress`, `completed`, `canceled`

Response 200: `{ page, page_size, total_pages, total_items, jobs: [Job] }`.

Job object:

```json
{
  "id": "",
  "invoice_number": "",
  "description": "",
  "customer": {},
  "address": {},
  "notes": [],
  "work_status": "",
  "work_timestamps": { "on_my_way_at": "", "started_at": "", "completed_at": "" },
  "schedule": { "scheduled_start": "", "scheduled_end": "", "arrival_window": 0, "appointments": [] },
  "total_amount": 0,
  "outstanding_balance": 0,
  "subtotal": 0,
  "assigned_employees": [],
  "tags": [],
  "original_estimate_id": "",
  "original_estimate_uuids": [],
  "lead_source": "",
  "job_fields": { "job_type": "", "business_unit": "" },
  "attachments": [],
  "locked_at": "",
  "created_at": "",
  "updated_at": "",
  "canceled_at": "",
  "deleted_at": "",
  "company_name": "",
  "company_id": "",
  "recurrence_number": "",
  "recurrence_rule": ""
}
```

### POST /jobs

Create a job. Requires existing customer and address IDs.

Body:

```json
{
  "invoice_number": "",
  "customer_id": "",
  "address_id": "",
  "schedule": {
    "scheduled_start": "",
    "scheduled_end": "",
    "arrival_window": 0,
    "anytime": false,
    "anytime_start_date": ""
  },
  "assigned_employee_ids": [],
  "line_items": [],
  "tags": [],
  "lead_source": "",
  "notes": "",
  "job_fields": { "job_type_id": "", "business_unit_id": "" }
}
```

Response 201: full Job object.

### GET /jobs/{id}

Get a single job by ID.

Query: `expand` - `attachments`, `appointments`.

Response 200: full Job object.

### POST /jobs/{job_id}/attachment

Add an attachment to a job with `multipart/form-data`.

### GET /jobs/{job_id}/line_items

List all line items for a job.

Response 200: `{ url, data: [LineItem] }`.

LineItem object:

```json
{
  "id": "",
  "name": "",
  "description": "",
  "unit_price": 0,
  "unit_cost": 0,
  "unit_of_measure": "",
  "quantity": 1,
  "kind": "labor",
  "taxable": true,
  "amount": 0,
  "order_index": 0,
  "service_item_id": "",
  "service_item_type": ""
}
```

### POST /jobs/{job_id}/line_items

Add a single line item to a job. Rate limited; use bulk update for multiple.

Body:

```json
{ "name": "", "description": "", "unit_price": 0, "quantity": 1, "unit_cost": 0, "kind": "labor", "taxable": true, "service_item_id": "", "service_item_type": "" }
```

Required: `name`.

Response 201: LineItem object.

### PUT /jobs/{job_id}/line_items/bulk_update

Bulk update a job's line items. Items without `id` are created as new.

Body:

```json
{ "line_items": [], "append_line_items": false }
```

Response 200: `{ url, data: [LineItem] }`.

### PUT /jobs/{job_id}/line_items/{id}

Update a single line item for a job.

Body:

```json
{ "service_item_id": "", "service_item_type": "", "name": "", "unit_price": 0, "unit_cost": 0, "quantity": 1, "kind": "", "taxable": true, "description": "" }
```

Response 200: LineItem object.

### DELETE /jobs/{job_id}/line_items/{id}

Delete a single line item from a job.

### PUT /jobs/{job_id}/schedule

Update a job's schedule. Jobs with more than one appointment must use appointment endpoints.

Body:

```json
{ "start_time": "", "end_time": "", "arrival_window_in_minutes": 0, "notify": false, "notify_pro": false, "expand": [], "dispatched_employees": [{ "employee_id": "" }] }
```

Response 200: `{ start_time, end_time, arrival_window_minutes, assigned_employees, appointments }`.

### DELETE /jobs/{job_id}/schedule

Delete a job's schedule.

### PUT /jobs/{job_id}/dispatch

Dispatch a job to employees.

Body:

```json
{ "dispatched_employees": [{ "employee_id": "" }] }
```

Response 200: `{ assigned_employees: [Employee] }`.

### GET /jobs/{job_id}/input_materials

List all job input materials for a job.

### PUT /jobs/{job_id}/input_materials/bulk_update

Bulk update a job's input materials.

### POST /jobs/{job_id}/tag

Add a tag to a job.

### POST /jobs/{job_id}/notes

Add a note to a job.

### DELETE /jobs/{job_id}/notes/{note_id}

Delete a job note.

### DELETE /jobs/{job_id}/tag

Remove a tag from a job.

### POST /jobs/{job_id}/link

Create a job link.

### POST /jobs/{job_id}/lock

Lock a single job.

### POST /jobs/lock

Lock multiple jobs.

## Job Appointments

### GET /jobs/{job_id}/appointments

Get all appointments for a job.

Response 200:

```json
{ "appointments": [{ "id": "", "start_date": "", "start_time": "", "end_time": "", "anytime": false, "arrival_window_minutes": 0, "dispatched_employees_ids": [] }] }
```

### POST /jobs/{job_id}/appointments

Add an appointment to a job.

Body:

```json
{ "start_time": "", "end_time": "", "arrival_window_minutes": 0, "dispatched_employees_ids": [] }
```

Required: `start_time`, `end_time`, `dispatched_employees_ids`.

Response 201: Appointment object.

### PUT /jobs/{job_id}/appointments/{appointment_id}

Update a job appointment.

Body:

```json
{ "start_time": "", "end_time": "", "arrival_window_minutes": 0, "dispatched_employees_ids": [] }
```

Response 200: Appointment object.

### DELETE /jobs/{job_id}/appointments/{appointment_id}

Delete a job appointment. Response 200.

## Job Invoices

### GET /jobs/{job_id}/invoices

List all invoices for a job.

Response 200:

```json
{
  "invoices": [
    {
      "id": "",
      "status": "",
      "invoice_number": "",
      "amount": 0,
      "subtotal": 0,
      "due_amount": 0,
      "due_at": "",
      "display_due_concept": "",
      "due_concept": "",
      "paid_at": "",
      "sent_at": "",
      "service_date": "",
      "invoice_date": "",
      "items": [],
      "taxes": [],
      "discounts": [],
      "payments": []
    }
  ]
}
```

## Job Types

### GET /job_types

Get a list of job types.

### POST /job_types

Create a new job type.

### PUT /job_types/{id}

Update a job type.

## Leads

### POST /leads

Create a lead. Requires existing customer ID or inline customer object.

Body:

```json
{
  "customer_id": "",
  "customer": {},
  "assigned_employee_id": "",
  "address_id": "",
  "address": {},
  "lead_source": "",
  "line_items": [],
  "note": "",
  "tags": [],
  "tax_name": "",
  "tax_rate": 0
}
```

Response 201: Lead object:

```json
{ "id": "", "number": "", "customer": {}, "address": {}, "lead_source": "", "tags": [], "assigned_employee": {}, "status": "open", "pipeline_status": "", "company_name": "", "company_id": "", "lost_at": "" }
```

### GET /leads

Get a paginated list of leads.

Query params: `customer_id`, `employee_ids`, `lead_source`, `location_ids`, `page`, `page_size`, `sort_by`, `sort_direction`, `status`, `tag_ids`.

`status`: `lost`, `open`, `won`.

Response 200: `{ page, page_size, total_pages, total_items, leads: [Lead] }`.

### GET /leads/{id}

Get a single lead by ID.

### POST /leads/{id}/convert

Convert a lead to an estimate or job.

Body:

```json
{ "type": "estimate" }
```

`type`: `estimate` or `job`.

Response 201: `{ job_id, estimate_id }`.

## Lead Line Items

### GET /leads/{lead_id}/line_items

List all line items for a lead.

Response 200: `{ page, page_size, total_pages, total_items, line_items: [LineItem] }`.

## Lead Sources

### GET /lead_sources

Get a list of lead sources.

Query params: `page`, `page_size`, `q`, `sort_direction`.

Response 200: `{ page, page_size, total_pages, total_items, lead_sources: [{ id, name, editable }] }`.

### POST /lead_sources

Create a lead source.

### PUT /lead_sources/{id}

Update a lead source.

## Application (OAuth Partners)

### GET /application

Get the application info for a company.

Response 200: `{ name, state, organization_id }`.

`state`: `enabled`, `disabled`, `pending`.

### POST /application/enable

Enable the application for a company.

### POST /application/disable

Disable the application for a company.

## Webhooks (API)

### POST /webhooks/subscription

Subscribe a company to webhook events. Webhooks are off by default per company.

Body: `{}`.

### DELETE /webhooks/subscription

Unsubscribe a company from webhook events.

## Materials (Price Book)

### GET /api/price_book/materials

Get all price book materials under a category.

Query params: `material_category_uuid` required, `page`, `page_size`, `sort_by`, `sort_direction`.

Response 200:

```json
{
  "object": "",
  "page": 1,
  "page_size": 10,
  "total_pages_count": 1,
  "total_count": 0,
  "data": {
    "uuid": "",
    "material_category_uuid": "",
    "name": "",
    "description": "",
    "image": "",
    "cost": 0,
    "unit_of_measure": "",
    "part_number": "",
    "price": 0,
    "flat_rate_enabled": false,
    "material_category_name": "",
    "taxable": false
  },
  "url": ""
}
```

### POST /api/price_book/materials

Create a new price book material.

Body:

```json
{ "material_category_uuid": "", "name": "", "price": 0, "cost": 0, "description": "", "unit_of_measure": "", "part_number": "", "flat_rate_enabled": false, "taxable": false }
```

Required: `material_category_uuid`, `name`, `price` in cents, `cost` in cents.

### PUT /api/price_book/materials/{uuid}

Update a material.

### DELETE /api/price_book/materials/{uuid}

Delete a material.

## Material Categories

### GET /api/price_book/material_categories

Get material categories.

### POST /api/price_book/material_categories

Create material category.

### DELETE /api/price_book/material_categories/{uuid}

Delete material category.

### PUT /api/price_book/material_categories/{uuid}

Update material category.

## Price Forms

### POST

Create a price form.

### GET

Get price forms.

### GET

Get a single price form.

### PUT

Update a price form.

### DELETE

Delete a price form.

## Price Book Services

### GET /api/price_book/services

Get a list of price book services.

Query params:

- `filters` deep object - `property`, `operator: eq`, `value`
- `page`
- `page_size`
- `q`
- `sort_by`
- `sort_direction`

Response 200:

```json
{ "services": [{ "page": 1, "page_size": 10, "total_pages": 1, "total_items": 0, "data": [], "url": "" }] }
```

Service object:

```json
{
  "uuid": "",
  "name": "",
  "description": "",
  "task_number": "",
  "image": "",
  "flat_rate_enabled": false,
  "service_materials": [],
  "service_labor_rates": [],
  "managed_by": "",
  "price": 0,
  "cost": 0,
  "taxable": false,
  "unit_of_measure": "",
  "category": "",
  "industry": "",
  "online_booking_enabled": false,
  "duration": 0,
  "bookable_as": "",
  "assigned_pros": [],
  "question_1": "",
  "question_2": ""
}
```

## Service Zones

### GET /service_zones

Get a list of service zones.

Query params: `address`, `page`, `page_size`, `zip_code`.

Response 200:

```json
{
  "page": 1,
  "page_size": 10,
  "total_pages": 1,
  "total_items": 0,
  "service_zones": [
    {
      "id": "",
      "name": "",
      "coverage_type": "",
      "trip_charge": 0,
      "fee_name": "",
      "zip_codes": [],
      "cities": [],
      "service_pros": []
    }
  ]
}
```

## Pipeline

### GET /pipeline/statuses

Get pipeline statuses for a resource type.

Query params:

- `resource_type` required - `lead`, `job`, `estimate`
- `page`, default `1`
- `page_size`, default `10`

Response 200:

```json
{ "page": 1, "page_size": 10, "total_pages": 1, "total_items": 0, "statuses": [{ "id": "", "name": "", "status_type": "" }] }
```

### PUT /pipeline/statuses/{id}

Update a pipeline status.

## Routes

### GET /routes

Get routes: groups of employees and their job appointments, events, and estimates for a date.

Query params:

- `date` - `YYYY-MM-DD`, default today
- `page`, default `1`
- `per_page`, default `10`

Response 200:

```json
{ "routes": [{ "id": "", "name": "", "color_hex": "", "date": "", "employee_ids": [], "job_appointments": [], "event_ids": [], "estimate_ids": [] }], "total_items": 0, "total_pages": 1, "page": 1, "page_size": 10 }
```

## Company

### GET /company

Get general company information.

Response 200:

```json
{
  "id": "",
  "name": "",
  "support_email": "",
  "phone_number": "",
  "logo_url": "",
  "address": { "street": "", "street_line_2": "", "city": "", "state": "", "zip": "", "country": "", "latitude": 0, "longitude": 0 },
  "website": "",
  "default_arrival_window": 0,
  "time_zone": "",
  "service_areas_data": { "zip_codes": [] },
  "locations": []
}
```

## Schedule

### GET /schedule/windows

Get schedule windows.

### PUT /schedule/windows

Update a company's schedule windows.

### GET

Booking windows.

## Events

### GET /events

Get a list of events.

Query params: `location_ids`, `page`, `page_size`, `sort_by`, `sort_direction`.

Response 200:

```json
{
  "page": 1,
  "page_size": 10,
  "total_pages": 1,
  "total_items": 0,
  "events": [
    {
      "id": "",
      "name": "",
      "note": "",
      "tags": [],
      "recurrence_rule": "",
      "address": {},
      "assigned_employees": [],
      "schedule": { "start_time": "", "end_time": "", "time_zone": "" },
      "all_day": false,
      "created_at": "",
      "updated_at": "",
      "company_name": "",
      "company_id": ""
    }
  ]
}
```

### GET /events/{id}

Get an event by ID.

## Tags

### GET /tags

Get a list of tags.

Query params: `page`, `page_size`, `sort_by` (`created_at` or `name`), `sort_direction`.

Response 200:

```json
{ "page": 1, "page_size": 10, "total_pages": 1, "total_items": 0, "tags": [{ "id": "", "name": "" }] }
```

### POST /tags

Create a tag.

Body: `{ "name": "" }`.

### PUT /tags/{id}

Update a tag.

Body: `{ "name": "" }`.

## Invoices

### GET /invoices

Get a paginated list of invoices across all jobs.

Query params:

- `amount_due_max`
- `amount_due_min`
- `created_at_max`
- `created_at_min`
- `customer_uuid`
- `due_at_max`
- `due_at_min`
- `location_ids`
- `page`
- `page_size`
- `paid_at_max`
- `paid_at_min`
- `payment_method`
- `sort_by`
- `sort_direction`
- `status` - `open`, `pending_payment`, `paid`, `voided`, `uncollectible`, `canceled`

Response 200: `{ page, page_size, total_pages, total_items, invoices: [JobInvoice with job_id field] }`.

### GET /invoices/{uuid}

Get an invoice by UUID.

### GET /invoices/{uuid}/preview

Preview an invoice by UUID.

## Common Shared Objects

Address:

```json
{ "id": "", "type": "billing", "street": "", "street_line_2": "", "city": "", "state": "", "zip": "", "country": "" }
```

Employee:

```json
{ "id": "", "first_name": "", "last_name": "", "email": "", "mobile_number": "", "color_hex": "", "avatar_url": "", "role": "", "created_at": "", "tags": [], "permissions": {}, "company_name": "", "company_id": "" }
```

LineItem response:

```json
{ "id": "", "name": "", "description": "", "unit_price": 0, "unit_cost": 0, "unit_of_measure": "", "quantity": 1, "kind": "labor", "taxable": true, "amount": 0, "order_index": 0, "service_item_id": "", "service_item_type": "" }
```

LineItem create:

```json
{ "name": "", "description": "", "unit_price": 0, "quantity": 1, "unit_cost": 0, "pricing_form": { "id": "", "fields": [{ "id": "", "value": "", "options": [{ "id": "" }] }] } }
```

Note:

```json
{ "id": "", "content": "" }
```

Attachment:

```json
{ "id": "", "file_name": "", "url": "", "file_type": "" }
```

Schedule:

```json
{ "scheduled_start": "", "scheduled_end": "", "arrival_window": 0, "appointments": [] }
```

Work timestamps:

```json
{ "on_my_way_at": "", "started_at": "", "completed_at": "" }
```

Appointment:

```json
{ "id": "", "start_date": "", "start_time": "", "end_time": "", "anytime": false, "arrival_window_minutes": 0, "dispatched_employees_ids": [] }
```

## Key Notes for AI-Assisted Development

1. Prices are in cents. `unit_price: 10000` means `$100.00`.
2. All dates and times use ISO 8601, for example `2023-03-23T15:30:00`.
3. Most list endpoints are paginated and return `page`, `page_size`, `total_pages`, and `total_items`.
4. Prefer bulk endpoints over single-item endpoints when creating or updating multiple records.
5. Many endpoints support an `expand` query param for nested objects like `attachments` or `appointments`.
6. For multi-location companies, use the `X-Company-Id` header or `location_ids` param.
7. Job work statuses may appear as `needs scheduling`, `scheduled`, `in progress`, `complete rated`, `complete unrated`, `user canceled`, or `pro canceled`.
8. Estimate and lead work statuses include `unscheduled`, `scheduled`, `in_progress`, `completed`, `canceled`, `lost`, `open`, and `won`.
9. Estimate option approval statuses include `pro declined`, `pro approved`, `declined`, `approved`, `awaiting response`, and `expired`.
10. Line item kinds include `labor`, `materials`, `fixed gratuity`, `fixed discount`, and `percent discount`.
11. Service item types include `market_place`, `organizational`, and `pricebook_material`.

