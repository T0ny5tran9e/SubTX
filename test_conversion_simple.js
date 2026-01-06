// Test VTT to SRT conversion
const vttContent = `WEBVTT

00:00:01.500 --> 00:00:04.200
Hello world, this is a test subtitle
with multiple lines.

00:00:05.000 --> 00:00:08.500
This is the second subtitle cue.
`;

console.log('Testing VTT to SRT conversion...');
console.log('Input VTT content:');
console.log(vttContent);
console.log('\nConverting...');

// Test the SubtitleConverter
const converter = new SubtitleConverter();
const srtResult = converter.convert(vttContent, 'vtt', 'srt');

console.log('\nOutput SRT content:');
console.log(srtResult);

// Check if it's valid SRT
const lines = srtResult.split('\n');
console.log('\nValidation:');
console.log('Has sequence numbers:', /^\d+$/.test(lines[0]));
console.log('Has SRT timing:', lines[1] && lines[1].includes('-->') && lines[1].includes(','));
console.log('Timestamps use commas:', lines[1] && lines[1].includes(','));