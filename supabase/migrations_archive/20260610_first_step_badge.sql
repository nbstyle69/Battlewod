-- Badge "First Step" — awarded when user completes the onboarding tutorial
INSERT INTO badges_catalog (badge_key, title, description, icon, category, sort_order)
VALUES ('first_step', 'First Step', 'Tu as complété le tutoriel — bienvenue dans la communauté AthleX !', '🚀', 'Progression', 0)
ON CONFLICT (badge_key) DO NOTHING;
