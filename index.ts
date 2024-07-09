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

async function get_image(image_data: Buffer) {
  const base64_data = Buffer.from(image_data).toString("base64");
  const msg = await anthropic.messages.create({
    model: "claude-3-haiku-20240307",
    max_tokens: 600,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/jpeg",
              data: base64_data,
            },
          },
          {
            type: "text",
            text: 'Given the image I have attached, return a JSON only of all the books in the image. Follow the given format: {"books": [{"title": "book_title_1", "author": "book_author_1"}, {"title": "book_title_2", "author": "book_author_2"}]} If there are missing fields, add an empty string.',
          },
        ],
      },
    ],
  });
  console.log(msg);
  return msg;
}

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
  // search for title
  // search for publisher
  // search for isbn
  // search for author
  // search for ^ + preferred extension
  // search for book
  // make the main one just search for book
  (ctx) => {
    ctx.reply("Please select what you would like to search for.", {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "Everything!",
              switch_inline_query_current_chat: "/GeneralSearch",
            },
          ],
          [
            {
              text: "Title",
              switch_inline_query_current_chat: "/TitleSearch",
            },
          ],
          [
            {
              text: "Publisher",
              switch_inline_query_current_chat: "/PublisherSearch",
            },
          ],
          [
            {
              text: "ISBN",
              switch_inline_query_current_chat: "/ISBNSearch",
            },
          ],
          [
            {
              text: "Author",
              switch_inline_query_current_chat: "/AuthorSearch",
            },
          ],
        ],
      },
    });
    return ctx.wizard.next();
    // TODO: create search functions for /GeneralSearch, /PublisherSearch, etc that take in a string argument, edit options, then call a shared function that returns search results.
    // Alternatively, use inline text to fetch for search results on the fly to show up as inline suggestions.  -> This will be harder but way cooler lol
  },
);

// This will be @botname /command. How do I do this? .command is only for /command...
bot.command(
  [
    "GeneralSearch",
    "TitleSearch",
    "PublisherSearch",
    "ISBNSearch",
    "AuthorSearch",
  ],
  async (ctx) => {
    const ourArgs = ctx.update.message.text.split(" ");
    const options = {
      mirror: libgenUrl,
      query: ourArgs.slice(1).join(" "),
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
        console.log(
          "Download: " +
            `${libgenUrl}/book/index.php?md5=` +
            data[n].md5.toLowerCase(),
        );
      }
    } catch (err) {
      console.error(err);
    }
  },
);
interface BookInterface {
  title: string;
  author: string;
  year: string;
  extension: "epub" | "mobi" | "azw3";
  md5: string;
}
const imagesDir = path.join(__dirname, "images");
bot.on(message("photo"), async (ctx) => {
  const imageId = ctx.message.photo.pop()!!.file_id || "Bruh";
  const imagePath = path.join(imagesDir, `${imageId}.jpeg`);
  if (fs.existsSync(imagePath) === true) {
    console.log("Image already exists, skipping download");
    const image_data = fs.readFileSync(imagePath);
    const json_books = await get_image(image_data);
    // console.log(json_books);
    return;
  }
  // console.log(`Downloading image ${imageId}`);
  // honestly I have no idea why the old version fails on macOS but works on windows.
  // hopefully this doesn't only work on macOS
  if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true });
  }
  const link = await ctx.telegram.getFileLink(imageId);
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
  const image_data = fs.readFileSync(imagePath);
  const json_books = await get_image(image_data);
  const booksObject = JSON.parse(json_books.content[0].text);
  // console.log(booksObject);
  const titleOptions = {
    mirror: libgenUrl,
    query: booksObject.books[0].title,
    count: 10,
    search_in: "title",
    sort_by: "year",
  };
  // console.log(titleOptions);
  let results = await libgen.search(titleOptions);
  // download the top result with ^extension from libgen, return it in a message.
  if (results.length > 0) {
    results = results.map((book: BookInterface) => ({
      title: book.title,
      author: book.author,
      year: book.year,
      extension: book.extension,
      downloadLink: `${libgenUrl}/book/index.php?md5=${book.md5.toLowerCase()}`,
    }));
    // console.log(results);
    // generate a pagination list of books to download, filter to epub
    const pagination = new Pagination({
      data: results, // array of items
      header: (currentPage, pageSize, total) =>
        `${currentPage} page of total ${total}`, // optional. Default value: 👇
      // `Items ${(currentPage - 1) * pageSize + 1 }-${currentPage * pageSize <= total ? currentPage * pageSize : total} of ${total}`;
      format: (item, index) => `${index + 1}. ${item.title}`, // optional. Default value: 👇
      // `${index + 1}. ${item}`;
      pageSize: 8, // optional. Default value: 10
      rowSize: 4, // optional. Default value: 5 (maximum 8)
      isButtonsMode: false, // optional. Default value: false. Allows you to display names on buttons (there is support for associative arrays)
      isEnabledDeleteButton: false,
      buttonModeOptions: {
        isSimpleArray: true, // optional. Default value: true. Enables/disables support for associative arrays
        titleKey: "", // optional. Default value: null. If the associative mode is enabled (isSimply: false), determines by which key the title for the button will be taken.
      },
      onSelect: (item, index) => {
        ctx.reply(`Download link for ${item.title}:\n${item.downloadLink}`);
      },
      messages: {
        // optional
        firstPage: "First page", // optional. Default value: "❗️ That's the first page"
        lastPage: "Last page", // optional. Default value: "❗️ That's the last page"
        prev: "◀️", // optional. Default value: "⬅️"
        next: "▶️", // optional. Default value: "➡️"
      },
    });

    pagination.handleActions(bot); // pass bot or scene instance as a parameter

    const text = await pagination.text(); // get pagination text
    const keyboard = await pagination.keyboard(); // get pagination keyboard
    console.log(text, keyboard);
    ctx.replyWithHTML(text, keyboard);
  } else {
    await ctx.reply("No books are found!");
    return;
  }
});

bot.command(["image"], async (ctx) => {
  await ctx.reply("Just send me an image.");
});

const stage = new Scenes.Stage<any>([searchScene]);
bot.use(session()); // https://github.com/telegraf/telegraf/issues/1171#issuecomment-1363134768
bot.use(stage.middleware());
bot.command(["search"], (ctx) => {
  ctx.scene.enter("searchScene");
});
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
