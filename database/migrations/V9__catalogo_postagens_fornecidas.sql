-- Registros reais das 28 imagens de public/Postagens, associados a artistas já existentes.
-- Idempotente por artista + título + caminho da imagem.
INSERT INTO public.portifolio
  (id_artista, id_categoria, id_estilo, titulo, descricao, preco, imagem, data_envio)
SELECT a.id_artista, c.id_categoria, e.id_estilo, seed.titulo, seed.descricao,
       seed.preco, seed.imagem, seed.data_envio::timestamp
FROM (VALUES
    (1, 'Sticker', 'Lineless', 'Gato de sorriso impossível', 'Ícone felino de alto contraste, perfeito para adesivos digitais e avatares.', 18.00, '/Postagens/2.jpeg', '2026-11-14 12:00:00'),
    (6, 'Doodle', 'Pop art', 'Gato de sorriso impossível II', 'Um pequeno gato travesso em vermelho vivo, com traço gráfico marcante.', 22.00, '/Postagens/2.jpeg', '2026-11-14 15:00:00'),
    (4, 'Ilustração digital', 'Sci-fi', 'Luzes de outro mundo', 'Retrato em neon violeta e azul, com atmosfera futurista e acabamento luminoso.', 21.50, '/Postagens/Lights - Mercedes Bazan.jpeg', '2026-11-13 12:00:00'),
    (8, 'Fanart', 'Cyberpunk', 'Luzes de outro mundo II', 'Uma personagem cercada por luzes elétricas e cores intensas para sua coleção.', 26.00, '/Postagens/Lights - Mercedes Bazan.jpeg', '2026-11-13 15:00:00'),
    (7, 'Retrato', 'Mangá', 'Silêncio em verde', 'Retrato delicado de uma jovem de perfil, com linhas limpas e paleta suave.', 25.00, '/Postagens/Procreate.jpeg', '2026-11-12 12:00:00'),
    (10, 'Ilustração digital', 'Lineless', 'Silêncio em verde II', 'Uma figura serena em composição minimalista e tons naturais.', 30.00, '/Postagens/Procreate.jpeg', '2026-11-12 15:00:00'),
    (9, 'Fanart', 'Dark', 'Olhar entre sombras', 'Close expressivo com sombras profundas e detalhes brilhantes no olhar.', 28.50, '/Postagens/Refs • Instagram.jpeg', '2026-11-11 12:00:00'),
    (12, 'Retrato', 'Semi realista', 'Olhar entre sombras II', 'Retrato dramático em tons frios, com iluminação cinematográfica.', 34.00, '/Postagens/Refs • Instagram.jpeg', '2026-11-11 15:00:00'),
    (11, 'Ilustração digital', 'Cute', 'Companhia azul', 'Cena aconchegante de uma pessoa e seu gato, em enquadramento de pôster.', 32.00, '/Postagens/Save this minimalist icon set idea for Procreate.jpeg', '2026-11-10 12:00:00'),
    (1, 'Fanart', 'Kawaii', 'Companhia azul II', 'Uma dupla adorável ilustrada com cores suaves e clima acolhedor.', 38.00, '/Postagens/Save this minimalist icon set idea for Procreate.jpeg', '2026-11-10 15:00:00'),
    (13, 'Character sheet', 'Fantasia', 'Inventora de pequenos mundos', 'Personagem original cercada de objetos curiosos e detalhes coloridos.', 35.50, '/Postagens/_ (1).jpeg', '2026-11-09 12:00:00'),
    (4, 'Ilustração digital', 'Chibi', 'Inventora de pequenos mund II', 'Uma aventureira excêntrica em composição vertical cheia de personalidade.', 42.00, '/Postagens/_ (1).jpeg', '2026-11-09 15:00:00'),
    (2, 'Retrato', 'Semi realista', 'Sonho azul', 'Estudo de rosto com pinceladas suaves em azul, rosa e lilás.', 39.00, '/Postagens/_ (10).jpeg', '2026-11-08 12:00:00'),
    (7, 'Pintura', 'Expressionista', 'Sonho azul II', 'Um retrato etéreo com textura pictórica e olhos luminosos.', 46.00, '/Postagens/_ (10).jpeg', '2026-11-08 15:00:00'),
    (6, 'Sticker', 'Kawaii', 'Gato preto e companhia', 'Gatinho preto acompanhado por pequenos amigos em traço fofo.', 42.50, '/Postagens/_ (11).jpeg', '2026-11-07 12:00:00'),
    (9, 'Ilustração digital', 'Cute', 'Gato preto e companhia II', 'Uma composição alegre de mascotes felinos para decorar seu espaço.', 50.00, '/Postagens/_ (11).jpeg', '2026-11-07 15:00:00'),
    (8, 'Sticker', 'Chibi', 'Pequeno guardião', 'Criaturinha fantástica em amarelo e laranja, desenhada como adesivo.', 18.00, '/Postagens/_ (12).jpeg', '2026-11-06 12:00:00'),
    (11, 'Character sheet', 'Cute', 'Pequeno guardião II', 'Um mascote travesso com formas arredondadas e expressão divertida.', 54.00, '/Postagens/_ (12).jpeg', '2026-11-06 15:00:00'),
    (10, 'Retrato', 'Y2K', 'Ritmo neon', 'Retrato pop de uma DJ com cores saturadas e energia de pista.', 21.50, '/Postagens/_ (13).jpeg', '2026-11-05 12:00:00'),
    (13, 'Fanart', 'Pop art', 'Ritmo neon II', 'Uma personagem vibrante em estética digital nostálgica.', 22.00, '/Postagens/_ (13).jpeg', '2026-11-05 15:00:00'),
    (12, 'Ilustração digital', 'Vaporwave', 'Frequência rosa', 'Composição psicodélica em rosa e ciano com clima alternativo.', 25.00, '/Postagens/_ (14).jpeg', '2026-11-04 12:00:00'),
    (2, 'Retrato', 'Grunge', 'Frequência rosa II', 'Arte de impacto com cores deslocadas e atitude rebelde.', 26.00, '/Postagens/_ (14).jpeg', '2026-11-04 15:00:00'),
    (1, 'Ilustração digital', 'Dark fantasy', 'Familiar da noite', 'Gato azul em cenário noturno, iluminado por brilhos misteriosos.', 28.50, '/Postagens/_ (15).jpeg', '2026-11-03 12:00:00'),
    (6, 'Fanart', 'Gótico', 'Familiar da noite II', 'Uma criatura felina mágica sob luz violeta e atmosfera sombria.', 30.00, '/Postagens/_ (15).jpeg', '2026-11-03 15:00:00'),
    (4, 'Character sheet', 'Mangá', 'Duas faces da aventura', 'Estudo de duas personagens em poses e expressões complementares.', 32.00, '/Postagens/_ (16).jpeg', '2026-11-14 12:00:00'),
    (8, 'Character sheet', 'Fantasia', 'Duas faces da aventura II', 'Dupla de heroínas com figurinos marcantes e paleta lilás.', 34.00, '/Postagens/_ (16).jpeg', '2026-11-14 15:00:00'),
    (7, 'Full body', 'Sci-fi', 'Passos esmeralda', 'Personagem futurista em traje gráfico preto e verde.', 35.50, '/Postagens/_ (17).jpeg', '2026-11-13 12:00:00'),
    (10, 'Character sheet', 'Cyberpunk', 'Passos esmeralda II', 'Design de personagem com silhueta forte e detalhes tecnológicos.', 38.00, '/Postagens/_ (17).jpeg', '2026-11-13 15:00:00'),
    (9, 'Fanart', 'Mangá', 'Flor de cerejeira', 'Personagem em quimono com flores brancas sobre fundo coral.', 39.00, '/Postagens/_ (18).jpeg', '2026-11-12 12:00:00'),
    (12, 'Ilustração digital', 'Cute', 'Flor de cerejeira II', 'Uma cena delicada de primavera em composição vertical.', 42.00, '/Postagens/_ (18).jpeg', '2026-11-12 15:00:00'),
    (11, 'Character sheet', 'Fantasia', 'Imperatriz das estrelas', 'Figura real em traje elaborado com detalhes dourados e celestes.', 42.50, '/Postagens/_ (19).jpeg', '2026-11-11 12:00:00'),
    (1, 'Fanart', 'Art nouveau', 'Imperatriz das estrelas II', 'Uma personagem majestosa envolta em ornamentos e estrelas.', 46.00, '/Postagens/_ (19).jpeg', '2026-11-11 15:00:00'),
    (13, 'Retrato', 'Mangá', 'Garota de olhar firme', 'Retrato frontal gráfico com fundo vermelho e expressão determinada.', 18.00, '/Postagens/_ (20).jpeg', '2026-11-10 12:00:00'),
    (4, 'Fanart', 'Pop art', 'Garota de olhar firme II', 'Composição de alto contraste com personalidade e cores fortes.', 50.00, '/Postagens/_ (20).jpeg', '2026-11-10 15:00:00'),
    (2, 'Character sheet', 'Gótico', 'Bruxa de bolso', 'Pequena feiticeira em roupa escura e detalhes lilases.', 21.50, '/Postagens/_ (21).jpeg', '2026-11-09 12:00:00'),
    (7, 'Ilustração digital', 'Chibi', 'Bruxa de bolso II', 'Uma bruxinha estilosa em versão compacta e cheia de charme.', 54.00, '/Postagens/_ (21).jpeg', '2026-11-09 15:00:00'),
    (6, 'Retrato', 'Cute', 'Lavanda ao vento', 'Personagem de cabelos lilases em composição leve e contemplativa.', 25.00, '/Postagens/_ (3).jpeg', '2026-11-08 12:00:00'),
    (9, 'Fanart', 'Lineless', 'Lavanda ao vento II', 'Uma ilustração suave com formas delicadas e clima de sonho.', 22.00, '/Postagens/_ (3).jpeg', '2026-11-08 15:00:00'),
    (8, 'Ilustração digital', 'Kawaii', 'Jardim de companhia', 'Cena coral com uma garota e seus pequenos companheiros felinos.', 28.50, '/Postagens/_ (4).jpeg', '2026-11-07 12:00:00'),
    (11, 'Sticker', 'Chibi', 'Jardim de companhia II', 'Um retrato divertido para quem gosta de gatos e cores alegres.', 26.00, '/Postagens/_ (4).jpeg', '2026-11-07 15:00:00'),
    (10, 'Retrato', 'Pop art', 'Explosão de cor', 'Retrato fotográfico reinterpretado com um raio de cor e luz.', 32.00, '/Postagens/_ (5).jpeg', '2026-11-06 12:00:00'),
    (13, 'Pintura', 'Expressionista', 'Explosão de cor II', 'Uma peça vibrante que mistura retrato e gesto pictórico.', 30.00, '/Postagens/_ (5).jpeg', '2026-11-06 15:00:00'),
    (12, 'Retrato', 'Kawaii', 'Doce pausa', 'Garota sorridente em tons pastel, acompanhada de pequenos doces.', 35.50, '/Postagens/_ (6).jpeg', '2026-11-05 12:00:00'),
    (2, 'Fanart', 'Cute', 'Doce pausa II', 'Uma cena delicada e açucarada para alegrar sua coleção.', 34.00, '/Postagens/_ (6).jpeg', '2026-11-05 15:00:00'),
    (1, 'Ilustração digital', 'Fantasia', 'Flores de outono', 'Personagem de cabelos claros entre flores douradas e folhas.', 39.00, '/Postagens/_ (7).jpeg', '2026-11-04 12:00:00'),
    (6, 'Ilustração digital', 'Cottagecore', 'Flores de outono II', 'Uma composição botânica acolhedora em tons de mel.', 38.00, '/Postagens/_ (7).jpeg', '2026-11-04 15:00:00'),
    (4, 'Ilustração digital', 'Vintage', 'Leitura à janela', 'Cena intimista de uma pessoa lendo junto à janela ensolarada.', 42.50, '/Postagens/_ (8).jpeg', '2026-11-03 12:00:00'),
    (8, 'Pintura', 'Watercolor', 'Leitura à janela II', 'Uma pausa tranquila pintada com textura e luz natural.', 42.00, '/Postagens/_ (8).jpeg', '2026-11-03 15:00:00'),
    (7, 'Fanart', 'Mangá', 'Riso em azul', 'Personagem em pose expressiva cercada de formas azuis explosivas.', 18.00, '/Postagens/_ (9).jpeg', '2026-11-14 12:00:00'),
    (10, 'Retrato', 'Pop art', 'Riso em azul II', 'Energia de mangá em uma composição gráfica cheia de movimento.', 46.00, '/Postagens/_ (9).jpeg', '2026-11-14 15:00:00'),
    (9, 'Fanart', 'Grunge', 'Rebeldia emoldurada', 'Cena narrativa de personagens emoldurados por uma atmosfera urbana.', 21.50, '/Postagens/rebel.jpeg', '2026-11-13 12:00:00'),
    (12, 'Ilustração digital', 'Punk', 'Rebeldia emoldurada II', 'Uma arte de grupo com espírito inconformista e acabamento dramático.', 50.00, '/Postagens/rebel.jpeg', '2026-11-13 15:00:00'),
    (11, 'Fanart', 'Fantasia', 'Visita ao entardecer', 'Cena cinematográfica de personagens em uma visita misteriosa.', 25.00, '/Postagens/🎐.jpeg', '2026-11-12 12:00:00'),
    (1, 'Ilustração digital', 'Dark', 'Visita ao entardecer II', 'Uma narrativa visual em tons profundos e iluminação verde.', 54.00, '/Postagens/🎐.jpeg', '2026-11-12 15:00:00'),
    (13, 'Retrato', 'Cute', 'Gato guardião', 'Personagem de óculos acompanhada por um gato preto sobre fundo dourado.', 28.50, '/Postagens/🐈_⬛.jpeg', '2026-11-11 12:00:00'),
    (4, 'Fanart', 'Kawaii', 'Gato guardião II', 'Uma dupla simpática em composição colorida e cheia de contraste.', 22.00, '/Postagens/🐈_⬛.jpeg', '2026-11-11 15:00:00')
) AS seed(id_artista, categoria, estilo, titulo, descricao, preco, imagem, data_envio)
JOIN public.artista a ON a.id_artista = seed.id_artista
JOIN public.categoria c ON c.nome_categoria = seed.categoria
JOIN public.estilo e ON e.nome_estilo = seed.estilo
WHERE NOT EXISTS (
  SELECT 1 FROM public.portifolio p
  WHERE p.id_artista = a.id_artista
    AND p.titulo = seed.titulo
    AND p.imagem = seed.imagem
);
