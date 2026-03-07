--
-- PostgreSQL database dump
--

\restrict hDnKWWdwvs9GXBV4pSLrFItXDfGzPayQwZckexQh0vp4MaZnd9NMZgYw4SQ5nHM

-- Dumped from database version 13.22 (Debian 13.22-1.pgdg13+1)
-- Dumped by pg_dump version 13.22 (Debian 13.22-1.pgdg13+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: songs; Type: TABLE DATA; Schema: public; Owner: reverse_user
--

INSERT INTO public.songs (id, title, artist, midi_file_path, lyrics, duration, difficulty, created_at) VALUES ('9e17c3ea-f7f3-425e-96ec-0d65b94cff91', 'Baby Shark', 'Kid song', 'Baby Shark.mp3', 'Baby shark, doo, doo, doo, doo, doo, doo.
Baby shark, doo, doo, doo, doo, doo, doo.
Baby shark!
Mommy shark, doo, doo, doo, doo, doo, doo.
Mommy shark, doo, doo, doo, doo, doo, doo.
Mommy shark, doo, doo, doo, doo, doo, doo.
Mommy shark!
Daddy shark, doo, doo, doo, doo, doo, doo.
Daddy shark, doo, doo, doo, doo, doo, doo.
Daddy shark, doo, doo, doo, doo, doo, doo.
Daddy shark!
Grandma shark, doo, doo, doo, doo, doo, doo.
Grandma shark, doo, doo, doo, doo, doo, doo.
Grandma shark, doo, doo, doo, doo, doo, doo.
Grandma shark!', 33, 'basic', '2025-10-26 17:37:08.83881');
INSERT INTO public.songs (id, title, artist, midi_file_path, lyrics, duration, difficulty, created_at) VALUES ('5f52dab1-fda9-43af-87c3-65b364acad95', 'Happy', 'Pharrell Williams', 'Happy.mp3', 'It might seem crazy what I am ''bout to say
Sunshine, she''s here you can take a break
I''ma hot air balloon that could go to space, huh
With the air, like I don''t care, baby, by the way, huh
Clap along if you feel like a room without a roof
(Because I''m happy)
Clap along if you feel like happiness is the truth
(Because I''m happy)
Clap along if you know what happiness is to you
(Because I''m happy)
Clap along if you feel like that''s what you wanna do', 47, 'basic', '2025-10-26 17:40:47.371031');
INSERT INTO public.songs (id, title, artist, midi_file_path, lyrics, duration, difficulty, created_at) VALUES ('d76803c6-8f24-4850-b63a-56c24b65e46d', 'Let It Go (Frozen)', 'Frozen OST', 'Let It Go (Frozen).mp3', 'It''s time to see what I can do
To test the limits and break through
No right, no wrong, no rules for me
I''m free
Let it go, let it go
I am one with the wind and sky
Let it go, let it go
You''ll never see me cry
Here I stand and here I stay
Let the storm rage on', 39, 'basic', '2025-10-26 17:47:04.067152');
INSERT INTO public.songs (id, title, artist, midi_file_path, lyrics, duration, difficulty, created_at) VALUES ('5e3f01e9-a193-4a09-8ea6-8a6065436fd1', 'Mary Had a Little Lamb', 'Kid song', 'Mary Had a Little Lamb.mp3', 'Mary had a little lamb,
little lamb,
little lamb. 
Mary had a little lamb,
its fleece was white as snow.
And everywhere that Mary went. 
Mary went. 
Mary went. 
And everywhere that Mary went,
the lamb was sure to go.', 18, 'basic', '2025-10-26 17:49:19.508799');
INSERT INTO public.songs (id, title, artist, midi_file_path, lyrics, duration, difficulty, created_at) VALUES ('21b94cb7-28cd-47be-8a01-5a20da19cfa9', 'Old Macdonald Had A Farm', 'Kid song', 'Old Macdonald.mp3', 'Old MacDonald had a farm, E-I-E-I-O,
And on that farm he had a cow, E-I-E-I-O.
With a moo moo here and a moo moo there,
Here a moo, there a moo, everywhere a moo moo,
Old MacDonald had a farm, E-I-E-I-O.

Old MacDonald had a farm, E-I-E-I-O,
And on that farm he had a pig, E-I-E-I-O.
With an oink oink here and an oink oink there,
Here an oink, there an oink, everywhere an oink oink,
Old MacDonald had a farm, E-I-E-I-O.', 38, 'basic', '2025-10-26 17:51:40.899389');
INSERT INTO public.songs (id, title, artist, midi_file_path, lyrics, duration, difficulty, created_at) VALUES ('ef197da8-d6c8-45be-8364-37f1f567ff78', 'Twinkle Twinkle Little Star', 'Kid song', 'Twinkle Twinkle Little Star.mp3', 'Twinkle, twinkle, little star,
how I wonder what you are.
Up above the world so high,
like a diamond in the sky.
Twinkle, twinkle, little star,
how I wonder what you are.', 26, 'basic', '2025-10-26 17:54:26.450297');
INSERT INTO public.songs (id, title, artist, midi_file_path, lyrics, duration, difficulty, created_at) VALUES ('c116b5e4-e373-4e56-b758-ec5d6352a3c1', 'You''ve Got A Friend In Me (Toy Story)', 'Toy Story OST', 'You''ve Got A Friend In Me (Toy Story).mp3', 'You''ve got a friend in me
You''ve got a friend in me
When the road looks rough ahead
And you''re miles and miles from your nice warm bed
You just remember what your old pal said
Boy, you''ve got a friend in me
Yeah, you''ve got a friend in me', 28, 'basic', '2025-10-26 17:56:25.209982');


--
-- PostgreSQL database dump complete
--

\unrestrict hDnKWWdwvs9GXBV4pSLrFItXDfGzPayQwZckexQh0vp4MaZnd9NMZgYw4SQ5nHM

