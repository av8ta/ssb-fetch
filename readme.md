# developing with insomnia / postman

Since insomnia and postman can't fetch ssb urls, we get around that by proxying through http.

```bash
npm run proxy
```

To run on a testnet set the `ssb_appname` env var as usual (defaults to ssb at ~/.ssb) before running proxy.

```bash
export ssb_appname=ssb-test
```

Creates an http server at http://locahost:8080

In insomnia you can either: `http://locahost:8080/ssb://xxx===` or set a base url in your environment:

```json
{
  "base_url": "http://localhost:8080/"
}
```

And then use `{{ _.base_url }}ssb://xxx===`

If you have a raw sigil id from the database you'll need to convert it to an ssb url. Simplest way is to paste it into the [agregore omnibox](https://github.com/AgregoreWeb/agregore-browser) where it's automatically converted for you. Or programmatically use [ssb-uri2](https://www.npmjs.com/package/ssb-uri2) from npm.

# readme driven development below (work in progress)

GET is implemented for blobs and json messages; what to do about publishing?

I would [prefer to use:](https://www.artima.com/articles/why-put-and-delete)

- PUT for uploading blobs
- PUT for new posts (have no root or branch)
  - check hash of author,type,content,timestamp-within-range for idempotency?
- POST for replies (root, branch etc) because they can't be truly idempotent; because of the tangle?
- DELETE for removing blobs from local store
- DELETE for tombstoning messages

All the [browsers that matter](https://caniuse.com/fetch) are supporting get, put, post, delete using fetch

[html5 forms only support get and post](https://www.w3.org/TR/html401/interact/forms.html#adef-method)

Would be nice to support html forms so that @cel could potentially use it as per his patchfoo client. What happens currently in agregore when submitting a form?

```html
<form action="" method="get">... name & email inputs</form>

<!-- ?name=bob&email=bob%40bob.com appended to url -->
```

```html
<form action="" method="post">... name & email inputs</form>

<!-- Content-Type: application/x-www-form-urlencoded -->
<!-- name=bob&email=bob%40bob.com -->
```

# querying by url

## querystring api

patchfox, oasis, and patchfoo all seem to have their own ways so that's a good excuse to invent a new standard!

![there's always a relevant xkcd!](https://imgs.xkcd.com/comics/standards_2x.png)
