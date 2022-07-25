#!/usr/bin/python3
#
# NOTE: this is a modified version of the bin2code.py script offered by M5Stack.
# To use, you need to convert a JPG or PNG to Microsoft BMP format in
# 16-bits BMP (R5G6B5) format (GIMP supports this in its Advanced BMP settings).
# You also need to flip the image vertically. Once done, the image can be
# translated with this script into a .c file which can then be included in the
# M5 code.
#
# NOTE that the method shown in the M5Stack repo and the one that requires a Windows
# C# app didn't work.
#
# Original code of this file can be downloaded from
# https://raw.githubusercontent.com/xoseperez/m5stack-rfm95/master/tools/bin2code.py
# Write-up: https://tinkerman.cat/post/m5stack-node-things-network
#

'''
# Example:
> python bin2code2.py m5_logo.jpg
> Out:m5_logo.jpg.c Done!
'''

import sys, os

in_name = sys.argv[1]
header_len = 138
out_name = in_name + '.c'
file_size = os.path.getsize(in_name)

with open(in_name, 'rb') as infile:
    with open(out_name, 'wb+') as outfile:

        arrary_name = 'const unsigned char ' + out_name[0:out_name.find('.')] + '[' +str(file_size-header_len)+'] = {\n'
        outfile.write(arrary_name.encode('utf-8'))

        # discard header
        if header_len > 0:
            data = infile.read(header_len)

        while True:
            data = infile.read(20)
            if len(data) > 0:
                for i in range(0, len(data)):
                    d = "0x%02x," % ord(chr(data[i]))
                    outfile.write(d.encode('utf-8'))
                outfile.write('\n'.encode('utf-8'))
            else:
                outfile.write('};\n'.encode('utf-8'))
                break

print('Out:'+ out_name +' Done!')
