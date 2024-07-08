const url = process.env.API_URL
const token = process.env.TOKEN
const data = {
  messaging_product: "whatsapp",
  to: "6581899220",
  type: "template",
  template: {
    name: "hello_world",
    language: {
      code: "en_US"
    }
  }
};

// fetch(url, {
//   method: 'POST',
//   headers: {
//     'Authorization': `Bearer ${token}`,
//     'Content-Type': 'application/json'
//   },
//   body: JSON.stringify(data)
// })
// .then(response => response.json())
// .then(data => console.log(data))
// .catch(error => console.error('Error:', error));

import { Elysia } from 'elysia'

new Elysia()
    .get('/', () => 'Hello Elysia')
    .get('/user/:id', ({ params: { id }}) => id)
    .post('/form', ({ body }) => body)
    .listen(3000)
