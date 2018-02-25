# sync-dut-file

<font size=4>sync file to dut via serial port or telnet once file changed</font>

----------

<font size=3>

Why should I need this tool?

I develop GUI in device which been accessed by serial port or telnet. If I want to modify somethings and check how it look pass out by cgi script, I need to typo 'tftp -g [lan pc ip] -r [filename]' every time. If I use this tool, I can make sure local files sync with they are in device. So I can foucs on coding.

----------

Usage:

        node app.js [-t|--telnet]

        using serial port as default

        ignore all parameters except '-t' and '--telnet'


once files in ./dut-root changed, files in dut will keep the same as.

</font>