import { Telegraf, Scenes, session, Markup } from "telegraf";
import { Pagination } from "telegraf-pagination";
import { message } from "telegraf/filters";
import libgen from "libgen"; // https://www.npmjs.com/package/libgen
import { WizardScene, BaseScene, Stage } from "telegraf/scenes";
const bot = new Telegraf<Scenes.SceneContext>(process.env.TOKEN || "");
// import { createWorker } from "tesseract.js"; // OCR
import fs from "fs";
import path from "path";
import https from "https";
import Anthropic from "@anthropic-ai/sdk";
const anthropic = new Anthropic();

const msg = await anthropic.messages.create({
  model: "claude-3-haiku-20240307",
  max_tokens: 100,
  messages: [
    {
      role: "user",
      content: [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: "image/jpeg",
            data: "/9j/4AAQSkZJRg...",
          },
        },
        {
          type: "text",
          text: "Given the image I have attached, return a JSON only of all the books in the image. Follow the given format: {'books: {'title': 'book_title', 'author': 'book_author'}}",
        },
      ],
    },
  ],
});
console.log(msg);
// good comment describing how to use scenes https://github.com/telegraf/telegraf/issues/705#issuecomment-549056045
bot.telegram.setMyCommands([
  {
    command: "start",
    description: "Introduction",
  },
  {
    command: "help",
    description: "Returns all the bot's functions",
  },
  {
    command: "search",
    description: "I'll search for the book you asked!",
  },
  {
    command: "image",
    description: "Upload an image after this to get me to search for a book!",
  },
  {
    command: "settings",
    description:
      "configure default extension, how many results to show per page",
  },
]);

if (process.env.TOKEN === "") {
  console.log("invalid TOKEN in .env");
  process.exit();
}

const libgenUrl = "http://libgen.is";
const count = 10;
const defaultExtension = "epub";
// bot.command('test', async (ctx) => {
//     return await ctx.reply('this is text', Markup
//       .keyboard([
//         ['button 1', 'button 2'], // Row1 with 2 buttons
//         ['button 3', 'button 4'], // Row2 with 2 buttons
//         ['button 5', 'button 6', 'button 7'] // Row3 with 3 buttons
//       ])
//       .oneTime()
//       .resize()
//     )
// })

bot.start((ctx) =>
  ctx.reply(
    "Welcome! Give me an image, and I will try and find a book for you. \nAlternatively, run /search to search for the book title.",
  ),
);
bot.help((ctx) =>
  ctx.reply(
    "/image: takes in an image input and searches for a book from libgen\n/search: takes in a text input and searches for a book from libgen",
  ),
);

export const searchScene = new WizardScene<any>(
  "searchScene",
  (ctx) => {
    // search for title
    // search for publisher
    // search for isbn
    // search for author
    // search for ^ + preferred extension
    // search for book
    // make the main one just search for book
    ctx.reply(
      "Please select what you would like to search for.", // https://github.com/telegraf/telegraf/discussions/1450
      Markup.inlineKeyboard([
        Markup.button.callback("Everything!", "GeneralSearch"),
        Markup.button.callback("Title", "TitleSearch"),
        Markup.button.callback("Publisher", "PublisherSearch"),
        Markup.button.callback("ISBN", "ISBNSearch"),
        Markup.button.callback("Author", "AuthorSearch"),
      ]),
    );
    return ctx.wizard.next();
  },
  (ctx) => {
    if (!ctx.callbackQuery.data) {
      ctx.reply("Please select an option.");
      return;
    }
    console.log(ctx.callbackQuery.data);
    ctx.reply("Please enter your search term.", {
      reply_markup: {
        inline_keyboard: [
          [
            { switch_inline_query_current_chat: `/${ctx.callbackQuery.data}` },
            // TODO: create search functions for /GeneralSearch, /PublisherSearch, etc that take in a string argument, edit options, then call a shared function that returns search results.
            // Alternatively, use inline text to fetch for search results on the fly to show up as inline suggestions.  -> This will be harder but way cooler lol
          ],
        ],
      },
    });
    return ctx.wizard.next();
  },
  async (ctx) => {
    const options = {
      mirror: libgenUrl,
      query: "cats",
      count: count,
      sort_by: "year",
    };
    try {
      const data = await libgen.search(options);
      let n = data.length;
      console.log(`${n} results for "${options.query}"`);
      while (n--) {
        console.log("");
        console.log("Title: " + data[n].title);
        console.log("Author: " + data[n].author);
        const url = await libgen.utils.check.canDownload(data);
        console.log(
          "Download: " +
            `http://${libgenUrl}/book/index.php?md5=` +
            data[n].md5.toLowerCase(),
        );
      }
    } catch (err) {
      console.error(err);
    }
  },
);

bot.command(["search"], async (ctx) => {
  await ctx.scene.enter("searchScene");
});

bot.on(message("photo"), async (ctx) => {
  // https://stackoverflow.com/a/77073874
  const imageId = ctx.message.photo.pop()!!.file_id || "Bruh";
  const link = await ctx.telegram.getFileLink(imageId);
  console.log(`Downloading image ${imageId}`);
  // honestly I have no idea why the old version fails on macOS but works on windows.
  // hopefully this doesn't only work on macOS
  const imagesDir = path.join(__dirname, "images");
  if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true });
  }
  const imagePath = path.join(imagesDir, `${imageId}.jpeg`);
  await new Promise<void>((resolve, reject) => {
    https
      .get(link.toString(), (response) => {
        const fileStream = fs.createWriteStream(imagePath);
        response.pipe(fileStream);
        fileStream.on("finish", () => {
          fileStream.close();
          // console.log(`Image saved to ${imagePath}`);
          resolve();
        });
        fileStream.on("error", reject);
      })
      .on("error", reject);
  });
  // take in an image, ocr its title or whatever
  // ocr with Tesseract
  // const ret = await worker.recognize(`images/${imageId}.jpeg`);
  // ok tesseract sucks. lets just use gemini or something
  console.log(ret.data.text);
  // download the top result with ^extension from libgen, return it in a message.
});

bot.command(["image"], async (ctx) => {
  await ctx.reply("Just send me an image.");
});

const stage = new Scenes.Stage<any>([searchScene]);
bot.use(session()); // https://github.com/telegraf/telegraf/issues/1171#issuecomment-1363134768
bot.use(stage.middleware());
// const worker = await createWorker("eng");
bot.launch();
console.log("running!");
// Enable graceful stop
process.once("SIGINT", async () => {
  bot.stop("SIGINT");
  // await worker.terminate();
});
process.once("SIGTERM", async () => {
  bot.stop("SIGTERM");
  // await worker.terminate();
});
