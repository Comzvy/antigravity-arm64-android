function uint8ToBase64(bytes) {
  var binary = "";
  var chunkSize = 0x8000;
  for (var i = 0; i < bytes.length; i += chunkSize) {
    var slice = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode.apply(null, slice);
  }
  return btoa(binary);
}

function pcmChunksToWavBase64(chunks, sampleRate) {
  var rate = sampleRate || 16000;
  var totalLen = 0;
  for (var i = 0; i < chunks.length; i++) {
    totalLen += chunks[i].byteLength;
  }
  if (totalLen === 0) {
    return "";
  }
  var wavBuffer = new ArrayBuffer(44 + totalLen);
  var view = new DataView(wavBuffer);

  function writeStr(offset, str) {
    for (var j = 0; j < str.length; j++) {
      view.setUint8(offset + j, str.charCodeAt(j));
    }
  }

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + totalLen, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true);  // AudioFormat (1 = PCM)
  view.setUint16(22, 1, true);  // NumChannels (1 = mono)
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true); // ByteRate (SampleRate * NumChannels * BitsPerSample/8)
  view.setUint16(32, 2, true);  // BlockAlign
  view.setUint16(34, 16, true); // BitsPerSample
  writeStr(36, "data");
  view.setUint32(40, totalLen, true);

  var out = new Uint8Array(wavBuffer);
  var offset = 44;
  for (var k = 0; k < chunks.length; k++) {
    out.set(chunks[k], offset);
    offset += chunks[k].byteLength;
  }
  return uint8ToBase64(out);
}

function blobToBase64(blob) {
  return new Promise(function (resolve, reject) {
    var reader = new FileReader();
    reader.onloadend = function () {
      var res = String(reader.result || "");
      var idx = res.indexOf(",");
      resolve(idx >= 0 ? res.slice(idx + 1) : res);
    };
    reader.onerror = function (e) {
      reject(e);
    };
    reader.readAsDataURL(blob);
  });
}
