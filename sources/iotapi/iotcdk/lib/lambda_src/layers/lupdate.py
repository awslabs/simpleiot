# © 2022 Amazon Web Services, Inc. or its affiliates. All Rights Reserved.
#
# SimpleIOT project.
# Author: Ramin Firoozye (framin@amazon.com)
#
# This is a simple way to update the layers and all items lambda functions referencing them.
# For a more complete solution, see the layermanager standalone utility.
#
try:
    import boto3
    from botocore.config import Config
    import click
    from rich import print
    from rich.table import Table
    from rich.console import Console
except Exception as e:
    print("ERROR: Have you run 'source venv/bin/activate' to initialize dev environment?")
    exit(1)

import datetime
import os
from operator import itemgetter
import json
import zipfile
from shutil import make_archive, rmtree
import tempfile

console = Console()
client = None

def make_and_read_zip(root):
    temp_dir = tempfile.mkdtemp()
    try:
        temp_archive = os.path.join(temp_dir, 'archive')
        with open(make_archive(temp_archive, 'zip', root), 'rb') as f:
            data = f.read()
        return data

    except Exception as e:
        print("ERROR: " + str(e))
        raise e

    finally:
        rmtree(temp_dir)


#
# Runtimes is an array of any of these (as of this writing). For a current list,
# check here: https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html
#
# 'nodejs'|'nodejs4.3'|'nodejs6.10'|'nodejs8.10'|'nodejs10.x'|'nodejs12.x'|'java8'|
# 'java8.al2'|'java11'|'python2.7'|'python3.6'|'python3.7'|'python3.8'|'dotnetcore1.0'|
# 'dotnetcore2.0'|'dotnetcore2.1'|'dotnetcore3.1'|'nodejs4.3-edge'|'go1.x'|'ruby2.5'|
# 'ruby2.7'|'provided'|'provided.al2'
#
# If path is a directory, we zip it up. If it's already a zipfile, we just use that.
#
def create_layer(name, desc, path, runtime):
    global client

    zip_bytes_content = None

    if zipfile.is_zipfile(path):
        with open(path, 'rb') as zip_data:
            zip_bytes_content = zip_data.read()
    else:
        if os.path.isdir(path):
            zip_bytes_content = make_and_read_zip(path)
        else:
            print("ERROR: path has to be directory or a zip file ")
            exit(1)

    if desc:
        result = client.publish_layer_version(
            LayerName=name,
            Description=desc,
            Content={
                'ZipFile': zip_bytes_content
            },
            CompatibleRuntimes=runtime
        )
    else:
        result = client.publish_layer_version(
            LayerName=name,
            Content={
                'ZipFile': zip_bytes_content
            },
            CompatibleRuntimes=runtime
        )

    return result


def make_one_layer(layer_path, layer_name, layer_desc, runtime):
    global client

    # No layer found - let's go create one.
    if layer_path and runtime:
        new_layer_result = create_layer(layer_name, layer_desc, layer_path, runtime)
        return new_layer_result
    else:
        print(f"ERROR: Layer {layer_name} does not exist. Runtime type and path to layer code must be provided.")
        exit(1)

def match_arn_ignoring_version(a1, a2):
    a1_list = a1.split(":")
    a2_list = a2.split(":")
    a1_list.pop()
    a2_list.pop()
    a1_new = ":".join(a1_list)
    a2_new = ":".join(a2_list)
    return a1_new == a2_new

def update_one_layer(layer_name, layer_desc, layer_path, replace_functions, quiet, runtime=None):
    global client
    #
    # First we see if the layer name provided exists. If it does, we want to take settings
    # from the last highest version and create a new version.
    #
    new_layer_result = None
    new_layer_version = None

    client = boto3.client('lambda')

    result = client.list_layer_versions(LayerName=layer_name)
    if not result:
        if not runtime:
            print(f"ERROR: at least one runtime must be specified")
            exit(1)
        new_layer_result = make_one_layer(layer_path, layer_name, layer_desc, [runtime])
    else:
        layer_versions = result['LayerVersions']
        if len(layer_versions) == 0:
            if not runtime:
                print(f"ERROR: at least one runtime must be specified")
                exit(1)
            new_layer_result = make_one_layer(layer_path, layer_name, [runtime])
        else:
            sorted_layers = sorted(layer_versions, key=itemgetter('Version'), reverse=True)
            highest_version = sorted_layers[0]
            highest_layer_arn = highest_version['LayerVersionArn']
            highest_layer_version = highest_version['Version']
            highest_layer_runtimes = highest_version['CompatibleRuntimes']

            if layer_path:
                runtimes_to_use = runtime if runtime else highest_layer_runtimes
                new_layer_result = create_layer(layer_name, layer_desc, layer_path, runtimes_to_use)
                new_layer_arn = new_layer_result['LayerVersionArn']
                new_layer_version = new_layer_result['Version']

            # Created. Now if we are also going to replace the layer reference for all functions,
            # we need to go get the list of all lambdas
            #
            print(f"Replacing functions: {replace_functions}")
            if replace_functions:
                funclist = []
                functions = client.list_functions()
                for func in functions['Functions']:
                    layers = func.get('Layers', None)
                    if layers:
                        for layer in layers:
                            layer_arn = layer['Arn']
                            if match_arn_ignoring_version(layer_arn, highest_layer_arn):
                                created_date = datetime.datetime.strptime(func['LastModified'], '%Y-%m-%dT%H:%M:%S.%f+0000')
                                display_date = created_date.strftime("%Y-%m-%d %I:%M:%S %p")

                                fdata = {
                                    "lambda_name": func['FunctionName'],
                                    "lambda_arn": func['FunctionArn'],
                                    "highest_layer_arn": layer_arn,
                                    "layer_list": layers,
                                    "modified": display_date
                                }
                                funclist.append(fdata)

                for f in funclist:
                    new_layers = []
                    layers = f['layer_list']
                    for layer in layers:
                        layer_arn = layer['Arn']
                        if match_arn_ignoring_version(layer_arn, highest_layer_arn):
                            new_layers.append(new_layer_arn) # skip the old highest version
                        else:
                            new_layers.append(layer_arn)
                    f['new_layers'] = new_layers

                    print(f"Updating... {f['lambda_name']}")
                    response = client.update_function_configuration(
                        FunctionName=f['lambda_name'],
                        Layers=f['new_layers']
                    )
                #
                # Here are the functions we're going to update
                #
                if funclist and not quiet:
                    table = Table(show_header=True, header_style="green")
                    table.add_column("Function Updated")
                    table.add_column("ARN")
                    table.add_column("New Layer Version")
                    for func in funclist:
                        table.add_row(func['lambda_name'], func['lambda_arn'], str(new_layer_version))

                    console.print(table)

    return new_layer_result

@click.command()
@click.option('--profile', help="AWS profile to use", default=None)
@click.option('--name', '-n', help='Layer name', required=True)
@click.option('--desc', '-d', help='Layer description')
@click.option('--path', '-p', help='Path to source directory or zip file', required=True)
@click.option('--runtime', '-r', help='Runtime', default=None)
@click.option('--replace/--no-replace', '-i', help='Replace in all lambdas invoking the previous versions', default=False)
@click.option('--quiet/--no-quiet', '-q', help='Replace quietly', default=False)
def lupdate(profile, name, desc, path, runtime, replace, quiet):
    if profile:
        boto3.setup_default_session(profile_name=profile)

    print(f"Updating layer {name} from path: {path}")
    update_one_layer(name, desc, path, replace, quiet, runtime)
    print("Done")

if __name__ == '__main__':
    lupdate()