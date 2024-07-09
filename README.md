# telegram_img2epub
## Telegram Bot that searches from Library Genesis for books.
### Takes in book covers (done with Claude Haiku API) and manual searching (WIP)
### How does it work?
* Uses libgen npm package as a wrapper around libgen's api.
* Uses claude haiku for vision recognition
### TODO:
- [x] Add image search function with images that return a list of books to download.
- [x] Add proper search function with text and multiple options
- [] Bulk image search. Download multiple books from a single image. 
    * (it is possible, but libgen returns weird results for books so I want to let the user be able to choose which to download for each book.)
- [] Preference setting for sorting by book filetype. Right now it's defaulted to epub.
- [] Preference setting for how many book listings should be listed at once. I don't want to spam libgen's api so it's limited to 10 for now.
