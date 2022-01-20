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
