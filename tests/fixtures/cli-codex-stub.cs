using System;
using System.IO;
using System.Web.Script.Serialization;
class CliCandidateStub {
  static int Main(string[] args) {
    Console.InputEncoding = new System.Text.UTF8Encoding(false);
    var serializer = new JavaScriptSerializer();
    string output = null; string schema = null;
    for (int i = 0; i < args.Length - 1; i++) { if (args[i] == "--output-last-message") output = args[i + 1]; if (args[i] == "--output-schema") schema = args[i + 1]; }
    var input = Console.In.ReadToEnd();
    var probe = Environment.GetEnvironmentVariable("AITE_CLI_PROBE");
    if (probe != null) File.WriteAllText(probe, serializer.Serialize(new { argv = args, input = input, schema = File.ReadAllText(schema), auth_home = Environment.GetEnvironmentVariable("CODEX_HOME") }));
    var mode = Environment.GetEnvironmentVariable("AITE_CLI_MODE");
    if (mode == "nonzero") { Console.Error.Write("PRIVATE-SECRET"); return 3; }
    if (mode == "oversize") File.WriteAllText(output, new string('x', 100000));
    else if (mode == "requirednull") File.WriteAllText(output, "{\"schema_version\":1,\"changes\":[{\"path\":null,\"action\":\"create\"}]}");
    else File.WriteAllText(output, "{\"schema_version\":1,\"base_checkpoint\":null,\"parent_hash\":null,\"changes\":[{\"path\":\"src/test/java/DemoTest.java\",\"action\":\"create\",\"before_hash\":null,\"after_hash\":null,\"new_content\":\"test\",\"patch\":null,\"scenario_ids\":[]}]}");
    Console.WriteLine("{\"type\":\"turn.completed\",\"usage\":{\"input_tokens\":1,\"output_tokens\":2}}");
    return 0;
  }
}
