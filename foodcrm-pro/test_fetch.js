const url = 'https://script.google.com/macros/s/AKfycbwUjbq7CcJnNOLaMFyordbU9tyZ2DhpSeK7P0E9FFkn5Qbe0gxW7PqM2qQdESgqIjPVGw/exec';
fetch(url).then(res => {
  console.log('Status:', res.status);
  console.log('Content-Type:', res.headers.get('content-type'));
  return res.text();
}).then(text => {
  console.log('Body start:', text.substring(0, 100));
}).catch(console.error);
