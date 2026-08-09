/**
 * Colonnes de `boxes` lisibles par l'app. Jamais `select('*')` : la Phase 3
 * (3B2) révoque `invite_code`, `stripe_account_id` et `dunning_grace_days` à
 * `authenticated`, et une étoile tomberait alors en 42501.
 * Le code d'invitation passe par la RPC `get_my_box_invite_code`.
 *
 * Littéraux (et non une concaténation) : supabase-js infère le type de la
 * ligne à partir du texte du select.
 */
export const BOX_COLUMNS = 'id, owner_id, name, slug, tagline, description, logo_url, cover_url, address, city, postal_code, country, latitude, longitude, phone, contact_email, website_url, instagram_url, google_maps_url, opening_hours, founded_at, sport_type, services, allowed_tournament_formats, terms_pdf_url, daily_publish_hour, weekly_publish_day, weekly_publish_hour, is_active, is_listed, member_count, created_at' as const;

export const BOX_MEMBERSHIP_COLUMNS = 'box_id, role, boxes(id, owner_id, name, slug, tagline, description, logo_url, cover_url, address, city, postal_code, country, latitude, longitude, phone, contact_email, website_url, instagram_url, google_maps_url, opening_hours, founded_at, sport_type, services, allowed_tournament_formats, terms_pdf_url, daily_publish_hour, weekly_publish_day, weekly_publish_hour, is_active, is_listed, member_count, created_at)' as const;
